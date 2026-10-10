'use strict';

// =====================================================
// TENDER TRACKER — APP.JS
// نسخه هماهنگ با تابع SQL: get_tender_dashboard(text, text, text)
// =====================================================

let client = null;
let filterRequestId = 0;

const S = {
  user: null,
  isAdmin: false,
  userGroup: null,
  profile: null,

  // rows contains the most recently returned (filtered) rows.
  tenders: [],
  filtered: [],

  stats: {
    total: 0,
    won: 0,
    tracking: 0,
    upcoming: 0,
    capacity: 0
  },

  editingId: null,
  editMode: false,
  columns: [],
  loading: false,
  saving: false
};

const $ = id => document.getElementById(id);

const GROUP_A = 'group_a';
const GROUP_B = 'group_b';
const GROUP_C = 'group_c';

// =====================================================
// COLUMN DEFINITIONS
// =====================================================

const COLUMN_DEFS = {
  tender_name: { label: 'نام مناقصه' },
  capacity_mw: { label: 'ظرفیت (MW)' },
  employer: { label: 'کارفرما' },
  consultant: { label: 'مشاور' },
  tonnage: { label: 'تناژ تقریبی (تن)' },
  proposer: { label: 'پیشنهاددهنده' },
  tender_date: { label: 'زمان مناقصه / پیش‌بینی' },
  tender_number: { label: 'شماره مناقصه' },
  city_province: { label: 'شهر و استان' },
  structure_type: { label: 'نوع سازه' },
  wind_snow: { label: 'بار باد و بار برف' },
  structure_weight: { label: 'وزن سازه' },
  notes: { label: 'ملاحظات' },
  follow_up_stage: { label: 'مرحله پیگیری' },
  proposed_price: { label: 'قیمت پیشنهادی' },
  final_result: { label: 'نتیجه نهایی' }
};

function visibleColumns() {
  if (S.isAdmin) {
    return [
      'tender_name', 'capacity_mw', 'employer', 'consultant',
      'tonnage', 'proposer', 'tender_date', 'tender_number',
      'city_province', 'structure_type', 'wind_snow',
      'structure_weight', 'notes', 'follow_up_stage',
      'proposed_price', 'final_result'
    ];
  }

  if (S.userGroup === GROUP_A) {
    return [
      'tender_name', 'capacity_mw', 'employer', 'consultant',
      'tonnage', 'tender_date', 'tender_number',
      'city_province', 'structure_type', 'wind_snow',
      'structure_weight'
    ];
  }

  if (S.userGroup === GROUP_B) {
    return [
      'tender_name', 'capacity_mw', 'employer', 'proposer',
      'tender_date', 'tender_number', 'notes',
      'follow_up_stage', 'proposed_price'
    ];
  }

  if (S.userGroup === GROUP_C) {
    return [
      'tender_name', 'capacity_mw', 'employer', 'consultant',
      'tonnage', 'proposer', 'tender_date', 'tender_number'
    ];
  }

  return [];
}

function cellValue(tender, key) {
  switch (key) {
    case 'city_province':
      return [tender.city, tender.province]
        .filter(v => v != null && String(v).trim() !== '')
        .join('، ') || '—';

    case 'wind_snow':
      return [
        tender.wind_load != null && String(tender.wind_load).trim() !== ''
          ? `باد: ${tender.wind_load}` : '',
        tender.snow_load != null && String(tender.snow_load).trim() !== ''
          ? `برف: ${tender.snow_load}` : ''
      ].filter(Boolean).join(' | ') || '—';

    default: {
      const value = tender[key];
      return value == null || String(value).trim() === '' ? '—' : value;
    }
  }
}

// =====================================================
// HELPERS
// =====================================================

function fa(value) {
  return String(value ?? '').replace(
    /\d/g,
    digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]
  );
}

function norm(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('fa-IR')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ');
}

function latinDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

// Parses values such as "۱٬۲۰۰", "1,200 MW", "12.5".
// Used as a defensive fallback if capacity arrives as a string.
function parseNumeric(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value == null) return null;

  let raw = latinDigits(value)
    .normalize('NFKC')
    .trim()
    .replace(/[\u200e\u200f\u061c]/g, '')
    .replace(/٫/g, '.')
    .replace(/[٬,\s\u00a0]/g, '');

  if (!raw || raw === '-' || raw === '—') return null;
  // Keep only a valid numeric representation; units such as MW are ignored.
  raw = raw.replace(/[^\d.+-]/g, '');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;

  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function toast(message) {
  const element = $('toast');

  if (!element) {
    console.log(message);
    return;
  }

  element.textContent = message;
  element.classList.add('show');

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.classList.remove('show');
  }, 3500);
}

function showLogin() {
  $('loginView')?.classList.remove('hidden');
  $('appView')?.classList.add('hidden');
}

function hideLogin() {
  $('loginView')?.classList.add('hidden');
  $('appView')?.classList.remove('hidden');
}

function initSupabase() {
  if (
    typeof APP_CONFIG === 'undefined' ||
    !APP_CONFIG.SUPABASE_URL ||
    !APP_CONFIG.SUPABASE_KEY
  ) {
    console.error('APP_CONFIG is missing or incomplete.');
    return false;
  }

  if (typeof supabase === 'undefined') {
    console.error('Supabase JavaScript library was not loaded.');
    return false;
  }

  client = supabase.createClient(
    APP_CONFIG.SUPABASE_URL,
    APP_CONFIG.SUPABASE_KEY
  );

  return true;
}

// =====================================================
// LOGIN
// =====================================================

async function handleLogin(event) {
  event.preventDefault();

  if (!client) {
    toast('اتصال سامانه برقرار نیست.');
    return;
  }

  const email = $('email')?.value.trim();
  const password = $('password')?.value;
  const errorBox = $('loginError');
  const submitButton = $('loginForm')?.querySelector('[type="submit"]');

  if (errorBox) errorBox.textContent = '';

  if (!email || !password) {
    if (errorBox) errorBox.textContent = 'ایمیل و رمز عبور را وارد کنید.';
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'در حال ورود...';
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data?.user) throw new Error('اطلاعات حساب کاربری دریافت نشد.');

    await loginUser(data.user);
  } catch (error) {
    console.error('LOGIN ERROR:', error);
    if (errorBox) {
      errorBox.textContent =
        error.message?.includes('Invalid login credentials')
          ? 'ایمیل یا رمز عبور اشتباه است.'
          : (error.message || 'خطا در ورود به سامانه.');
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'ورود';
    }
  }
}

// =====================================================
// USER PROFILE
// =====================================================

async function loginUser(user) {
  if (!user || !client) return;

  S.user = user;
  S.isAdmin = false;
  S.userGroup = null;
  S.profile = null;
  S.editMode = false;
  S.tenders = [];
  S.filtered = [];
  S.stats = { total: 0, won: 0, tracking: 0, upcoming: 0, capacity: 0 };
  S.columns = [];

  try {
    const { data: profile, error } = await client
      .from('profiles')
      .select('id, full_name, is_admin, user_group')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile) {
      throw new Error(
        'برای این حساب پروفایل ثبت نشده است. با مدیر سامانه تماس بگیرید.'
      );
    }

    S.profile = profile;
    S.isAdmin = profile.is_admin === true;
    S.userGroup = profile.user_group;

    if (
      !S.isAdmin &&
      ![GROUP_A, GROUP_B, GROUP_C].includes(S.userGroup)
    ) {
      throw new Error('گروه کاربری این حساب مشخص نیست.');
    }

    S.columns = visibleColumns();

    hideLogin();
    configureFilters();
    configureStats();
    updateAdminUI();
    buildTableHeaders();

    await load();
  } catch (error) {
    console.error('PROFILE / LOGIN USER ERROR:', error);

    if ($('loginError')) {
      $('loginError').textContent =
        error.message || 'خطا در دریافت اطلاعات کاربر.';
    }

    toast(error.message || 'خطا در دریافت اطلاعات کاربر.');
    await client.auth.signOut();
    resetUserState();
    showLogin();
  }
}

// =====================================================
// LOGOUT / RESET
// =====================================================

async function logout() {
  if (!client) return;

  const { error } = await client.auth.signOut();
  if (error) {
    console.error('LOGOUT ERROR:', error);
    toast('خطا در خروج از حساب: ' + error.message);
    return;
  }

  resetUserState();
  showLogin();
}

function resetUserState() {
  S.user = null;
  S.isAdmin = false;
  S.userGroup = null;
  S.profile = null;
  S.tenders = [];
  S.filtered = [];
  S.stats = { total: 0, won: 0, tracking: 0, upcoming: 0, capacity: 0 };
  S.editMode = false;
  S.editingId = null;
  S.columns = [];
  S.loading = false;
  S.saving = false;
  filterRequestId++;

  if ($('email')) $('email').value = '';
  if ($('password')) $('password').value = '';
  if ($('loginError')) $('loginError').textContent = '';
  if ($('tenderBody')) $('tenderBody').innerHTML = '';
  if ($('searchInput')) $('searchInput').value = '';
  if ($('stageFilter')) $('stageFilter').value = '';
  if ($('resultFilter')) $('resultFilter').value = '';

  configureStats();
  updateAdminUI();
  buildTableHeaders();
  updateStatsToZero();
}

function updateStatsToZero() {
  if ($('statTotal')) $('statTotal').textContent = fa(0);
  if ($('statTracking')) $('statTracking').textContent = fa(0);
  if ($('statWon')) $('statWon').textContent = fa(0);
  if ($('statCapacity')) $('statCapacity').textContent = '۰ MW';
  if ($('statUpcoming')) $('statUpcoming').textContent = fa(0);
  if ($('rowCount')) $('rowCount').textContent = fa(0) + ' مورد';
}

// =====================================================
// ADMIN UI
// =====================================================

function updateAdminUI() {
  document.querySelectorAll('.admin').forEach(element => {
    element.classList.toggle('hidden', !S.isAdmin);
  });

  const editButton = $('editModeBtn');
  if (editButton) {
    editButton.textContent = S.editMode ? '✓ اتمام ویرایش' : '✎ ویرایش جدول';
  }

  const title = document.querySelector('.table-head h2');
  if (title) {
    title.textContent = S.isAdmin
      ? 'جدول کامل مناقصات'
      : S.userGroup === GROUP_A
        ? 'جدول مناقصات - گروه فنی'
        : S.userGroup === GROUP_B
          ? 'جدول مناقصات - گروه بازرگانی'
          : 'فهرست مناقصات';
  }

  const reportTitle = document.querySelector('.report-title h2');
  if (reportTitle) {
    reportTitle.textContent = S.isAdmin
      ? 'مناقصات در دست اقدام واحد تجدیدپذیر'
      : 'گزارش مناقصات';
  }

  buildTableHeaders();
}

function toggleEditMode() {
  if (!S.isAdmin) {
    toast('دسترسی مدیر لازم است.');
    return;
  }

  S.editMode = !S.editMode;
  updateAdminUI();
  render();
}

// =====================================================
// TABLE HEADERS
// =====================================================

function buildTableHeaders() {
  const thead = document.querySelector('.table-scroll table thead');
  if (!thead) return;

  const headers = S.columns.map(key => {
    const definition = COLUMN_DEFS[key];
    return `<th scope="col">${esc(definition?.label || key)}</th>`;
  });

  if (S.isAdmin && S.editMode) {
    headers.push('<th class="admin-col">عملیات</th>');
  }

  thead.innerHTML = `<tr>${headers.join('')}</tr>`;
}

// =====================================================
// FILTERS
// =====================================================

function configureFilters() {
  const stage = $('stageFilter');
  const result = $('resultFilter');
  const search = $('searchInput');

  if (stage) stage.classList.remove('hidden');
  if (result) result.classList.remove('hidden');

  if (search) {
    search.placeholder =
      'جستجو در نام، کارفرما، مشاور، پیشنهاددهنده، شماره و سایر اطلاعات...';
  }
}

function clearFilters() {
  if ($('searchInput')) $('searchInput').value = '';
  if ($('stageFilter')) $('stageFilter').value = '';
  if ($('resultFilter')) $('resultFilter').value = '';
  apply();
}

// =====================================================
// STATISTICS VISIBILITY
// =====================================================

function configureStats() {
  [
    'statTotal', 'statTracking', 'statWon',
    'statCapacity', 'statUpcoming'
  ].forEach(id => {
    const element = $(id);
    const card = element?.closest('.stats > div');
    if (card) card.classList.remove('hidden');
  });
}

// =====================================================
// DASHBOARD DATA
// Requires SQL function get_tender_dashboard(text, text, text).
// Stats are global; rows are filtered server-side and column-limited by role.
// =====================================================

function readFilters() {
  return {
    p_search: $('searchInput')?.value?.trim() || '',
    p_stage: $('stageFilter')?.value?.trim() || '',
    p_result: $('resultFilter')?.value?.trim() || ''
  };
}

function acceptDashboardResponse(data) {
  if (!data || !Array.isArray(data.rows) || !data.stats) {
    throw new Error(
      'پاسخ داشبورد معتبر نیست. بررسی کنید تابع SQL get_tender_dashboard نصب شده باشد.'
    );
  }

  // These rows are already filtered by SQL and restricted to the user's columns.
  S.tenders = data.rows;
  S.filtered = data.rows;

  // Stats are calculated by SQL from the full table, not the filtered rows.
  S.stats = {
    total: Number(data.stats.total) || 0,
    won: Number(data.stats.won) || 0,
    tracking: Number(data.stats.tracking) || 0,
    upcoming: Number(data.stats.upcoming) || 0,
    capacity: Number(data.stats.capacity) || 0
  };

  stats();
  render();
}

async function fetchDashboard(filters = readFilters(), requestId = null) {
  if (!client || !S.user) {
    throw new Error('ابتدا وارد حساب کاربری شوید.');
  }

  const { data, error } = await client.rpc('get_tender_dashboard', filters);
  if (error) throw error;

  // Ignore responses from an older request so stale filters never overwrite newer rows.
  if (requestId !== null && requestId !== filterRequestId) return false;
  acceptDashboardResponse(data);
  return true;
}

async function load() {
  if (!client || !S.user) return false;

  // A refresh is also a new request and invalidates any pending filter response.
  const requestId = ++filterRequestId;
  const filters = readFilters();
  S.loading = true;
  try {
    const accepted = await fetchDashboard(filters, requestId);
    if (!accepted) return false;
    if ($('lastUpdated')) {
      $('lastUpdated').textContent =
        'آخرین بروزرسانی: ' + new Date().toLocaleString('fa-IR');
    }
    return true;
  } catch (error) {
    if (requestId === filterRequestId) {
      console.error('LOAD ERROR:', error);
      toast('خطا در دریافت مناقصه‌ها: ' + error.message);
    }
    return false;
  } finally {
    if (requestId === filterRequestId) S.loading = false;
  }
}

// =====================================================
// SEARCH / FILTER
// Each response is guarded against older requests returning late.
// =====================================================

async function apply() {
  if (!client || !S.user) return;

  const requestId = ++filterRequestId;
  const filters = readFilters();

  try {
    const { data, error } = await client.rpc('get_tender_dashboard', filters);
    if (error) throw error;

    if (requestId !== filterRequestId) return;
    acceptDashboardResponse(data);
  } catch (error) {
    if (requestId === filterRequestId) {
      console.error('FILTER ERROR:', error);
      toast('خطا در اعمال فیلتر: ' + error.message);
    }
  }
}

// =====================================================
// TABLE RENDER
// =====================================================

function resultClass(value) {
  const result = norm(value);

  if (result.includes('برنده')) return 'won';
  if (result.includes('بازنده') || result.includes('عدم پذیرش')) return 'lost';
  if (result.includes('انتظار') || result.includes('در حال')) return 'wait';

  return '';
}

function render() {
  const body = $('tenderBody');
  if (!body) return;

  if ($('rowCount')) {
    $('rowCount').textContent = fa(S.filtered.length) + ' مورد';
  }

  if (!S.filtered.length) {
    const columnCount = S.columns.length + (S.isAdmin && S.editMode ? 1 : 0);
    body.innerHTML = `
      <tr>
        <td colspan="${Math.max(1, columnCount)}"
            style="text-align:center;padding:40px 15px">
          موردی برای نمایش وجود ندارد.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = S.filtered.map(tender => {
    const cells = S.columns.map(key => {
      const value = cellValue(tender, key);
      let className = '';

      if (key === 'tender_name') {
        className = 'project-cell';
      } else if (
        ['capacity_mw', 'tonnage', 'proposed_price', 'structure_weight'].includes(key)
      ) {
        className = 'number-cell';
      } else if (key === 'tender_date') {
        className = 'date-cell';
      } else if (key === 'notes') {
        className = 'notes-cell';
      }

      let content = esc(value);
      if (key === 'follow_up_stage') {
        content = `<span class="badge stage-badge">${esc(value)}</span>`;
      }
      if (key === 'final_result') {
        content = `<span class="badge ${resultClass(value)}">${esc(value)}</span>`;
      }

      return `<td class="${className}">${content}</td>`;
    });

    if (S.isAdmin && S.editMode) {
      // UUIDs are escaped before being inserted into the inline handler.
      const safeId = esc(tender.id);
      cells.push(`
        <td class="actions-cell">
          <button type="button" onclick="editTender('${safeId}')">ویرایش</button>
          <button type="button" onclick="deleteTender('${safeId}')">حذف</button>
        </td>`);
    }

    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}

// =====================================================
// STATISTICS — uses SQL stats from the full dataset
// =====================================================

function stats() {
  const values = S.stats || {};

  if ($('statTotal')) $('statTotal').textContent = fa(values.total || 0);
  if ($('statTracking')) $('statTracking').textContent = fa(values.tracking || 0);
  if ($('statWon')) $('statWon').textContent = fa(values.won || 0);
  if ($('statUpcoming')) $('statUpcoming').textContent = fa(values.upcoming || 0);

  if ($('statCapacity')) {
    const capacity = Number(values.capacity) || 0;
    $('statCapacity').textContent =
      fa(capacity.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      })) + ' MW';
  }

  console.debug('Dashboard statistics:', values);
}

// =====================================================
// ADMIN FORM
// =====================================================

const FORM_FIELDS = [
  ['tender_name', 'نام مناقصه', true],
  ['capacity_mw', 'ظرفیت (MW)'],
  ['employer', 'کارفرما'],
  ['consultant', 'مشاور'],
  ['tonnage', 'تناژ تقریبی (تن)'],
  ['proposer', 'پیشنهاددهنده'],
  ['tender_date', 'زمان مناقصه / پیش‌بینی'],
  ['tender_number', 'شماره مناقصه'],
  ['city', 'شهر'],
  ['province', 'استان'],
  ['structure_type', 'نوع سازه'],
  ['wind_load', 'بار باد'],
  ['snow_load', 'بار برف'],
  ['structure_weight', 'وزن سازه'],
  ['notes', 'ملاحظات'],
  ['follow_up_stage', 'مرحله پیگیری'],
  ['proposed_price', 'قیمت پیشنهادی'],
  ['final_result', 'نتیجه نهایی']
];

function prepareForm() {
  const form = $('tenderForm');
  if (!form || form.dataset.prepared === 'yes') return;

  form.innerHTML = `
    ${FORM_FIELDS.map(([key, label, required]) => `
      <label class="${key === 'notes' ? 'full' : ''}" for="f_${key}">
        ${esc(label)}
        ${
          key === 'notes'
            ? `<textarea id="f_${key}" name="${key}" rows="3"></textarea>`
            : `<input id="f_${key}" name="${key}" type="text"
                      autocomplete="off" ${required ? 'required' : ''}>`
        }
      </label>
    `).join('')}
    <div class="full modal-actions">
      <button type="button" onclick="closeModal()">انصراف</button>
      <button class="primary" type="submit">ذخیره مناقصه</button>
    </div>`;

  form.addEventListener('submit', save);
  form.dataset.prepared = 'yes';
}

// =====================================================
// MODAL
// =====================================================

function openModal(tender = null) {
  if (!S.isAdmin) {
    toast('فقط مدیر می‌تواند مناقصه ثبت یا ویرایش کند.');
    return;
  }

  prepareForm();
  S.editingId = tender?.id || null;

  if ($('modalTitle')) {
    $('modalTitle').textContent = tender ? 'ویرایش مناقصه' : 'ثبت مناقصه جدید';
  }

  FORM_FIELDS.forEach(([key]) => {
    const input = $(`f_${key}`);
    if (input) input.value = tender?.[key] ?? '';
  });

  $('modal')?.classList.remove('hidden');
  const firstInput = $('f_tender_name');
  if (firstInput) setTimeout(() => firstInput.focus(), 0);
}

function closeModal() {
  $('modal')?.classList.add('hidden');
  S.editingId = null;
}

// =====================================================
// SAVE
// =====================================================

async function save(event) {
  event?.preventDefault();

  if (!S.isAdmin) {
    toast('شما اجازه ویرایش ندارید.');
    return;
  }
  if (S.saving) return;

  const form = $('tenderForm');
  if (form && !form.reportValidity()) return;

  const wasEditing = Boolean(S.editingId);
  const tenderId = S.editingId || null;
  const payload = {};

  FORM_FIELDS.forEach(([key]) => {
    const input = $(`f_${key}`);
    payload[key] = input && input.value.trim() !== ''
      ? input.value.trim()
      : null;
  });

  S.saving = true;
  const submitButton = form?.querySelector('[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'در حال ذخیره...';
  }

  try {
    const { error } = await client.rpc('save_tender', {
      p_payload: payload,
      p_tender_id: tenderId
    });
    if (error) throw error;

    closeModal();
    const loaded = await load();

    toast(
      loaded
        ? (wasEditing ? 'مناقصه ویرایش شد.' : 'مناقصه ثبت شد.')
        : 'ذخیره انجام شد، اما بروزرسانی جدول موفق نبود.'
    );
  } catch (error) {
    console.error('SAVE ERROR:', error);
    toast('خطا در ذخیره مناقصه: ' + error.message);
  } finally {
    S.saving = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'ذخیره مناقصه';
    }
  }
}

// =====================================================
// EDIT / DELETE
// =====================================================

window.editTender = function(id) {
  if (!S.isAdmin) {
    toast('دسترسی مدیر لازم است.');
    return;
  }

  const tender = S.tenders.find(item => String(item.id) === String(id));
  if (!tender) {
    toast('مناقصه پیدا نشد. فیلترها را پاک کنید یا جدول را بروزرسانی کنید.');
    return;
  }

  openModal(tender);
};

window.deleteTender = async function(id) {
  if (!S.isAdmin) {
    toast('دسترسی مدیر لازم است.');
    return;
  }

  if (!confirm('آیا از حذف این مناقصه مطمئن هستید؟')) return;

  try {
    const { error } = await client.rpc('delete_tender', {
      p_tender_id: id
    });
    if (error) throw error;

    const loaded = await load();
    if (loaded) toast('مناقصه حذف شد.');
  } catch (error) {
    console.error('DELETE ERROR:', error);
    toast('خطا در حذف مناقصه: ' + error.message);
  }
};

// =====================================================
// EXPORT PDF
// =====================================================

async function pdf() {
  if (typeof html2pdf !== 'function') {
    toast('کتابخانه تولید PDF بارگذاری نشده است.');
    return;
  }
  if (!S.filtered.length) {
    toast('موردی برای چاپ وجود ندارد.');
    return;
  }

  const original = document.querySelector('.table-card');
  if (!original) {
    toast('جدول پیدا نشد.');
    return;
  }

  const report = original.cloneNode(true);
  report.querySelectorAll('.admin, .actions-cell, .admin-col')
    .forEach(element => element.remove());

  const table = report.querySelector('table');
  if (table) {
    table.style.cssText =
      'width:100%;min-width:0;border-collapse:collapse;table-layout:auto;direction:rtl;';

    table.querySelectorAll('th').forEach(th => {
      th.style.cssText =
        'background:#454b4e;color:#fff;border:1px solid #aaa;padding:7px;text-align:center;white-space:normal;';
    });

    table.querySelectorAll('td').forEach(td => {
      td.style.cssText =
        'border:1px solid #ccc;padding:7px;text-align:center;vertical-align:top;overflow-wrap:anywhere;';
    });
  }

  const date = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const heading = document.createElement('h2');
  heading.textContent = S.isAdmin
    ? 'گزارش کامل مناقصات'
    : S.userGroup === GROUP_A
      ? 'گزارش مناقصات - گروه فنی'
      : S.userGroup === GROUP_B
        ? 'گزارش مناقصات - گروه بازرگانی'
        : 'گزارش مناقصات';

  heading.style.cssText =
    'text-align:center;margin:0 0 14px;font-size:18px;';

  const dateLine = document.createElement('p');
  dateLine.textContent = `تاریخ گزارش: ${date}`;
  dateLine.style.cssText = 'text-align:left;font-size:11px;margin-bottom:12px;';

  report.querySelector('.report-title')?.remove();
  report.insertBefore(dateLine, report.firstChild);
  report.insertBefore(heading, report.firstChild);

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-30000px;top:0;width:1600px;padding:20px;background:#fff;color:#222;direction:rtl;font-family:Tahoma,sans-serif;';

  report.style.cssText =
    'display:block;width:100%;max-width:none;height:auto;overflow:visible;background:#fff;border:0;box-shadow:none;';

  const scroll = report.querySelector('.table-scroll');
  if (scroll) scroll.style.cssText = 'max-height:none;overflow:visible;';

  host.appendChild(report);
  document.body.appendChild(host);

  try {
    await html2pdf().set({
      margin: 8,
      filename: `گزارش_مناقصات_${date.replace(/\//g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 1.5,
        backgroundColor: '#ffffff',
        useCORS: true
      },
      jsPDF: {
        unit: 'mm',
        format: 'a3',
        orientation: 'landscape'
      },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(report).save();

    toast('گزارش PDF آماده شد.');
  } catch (error) {
    console.error('PDF ERROR:', error);
    toast('خطا در تولید PDF.');
  } finally {
    host.remove();
  }
}

// =====================================================
// BOOT / SESSION
// =====================================================

async function boot() {
  if (!initSupabase()) {
    showLogin();
    if ($('loginError')) {
      $('loginError').textContent =
        'تنظیمات Supabase در config.js صحیح نیست.';
    }
    return;
  }

  showLogin();

  const loginForm = $('loginForm');
  if (loginForm && loginForm.dataset.bound !== 'yes') {
    loginForm.addEventListener('submit', handleLogin);
    loginForm.dataset.bound = 'yes';
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error('SESSION ERROR:', error);
    toast('خطا در بررسی نشست کاربر.');
    return;
  }

  if (data?.session?.user) {
    await loginUser(data.session.user);
  }

  client.auth.onAuthStateChange(async event => {
    if (event === 'SIGNED_OUT') {
      resetUserState();
      showLogin();
    }
  });
}

// =====================================================
// KEYBOARD
// =====================================================

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const modal = $('modal');
    if (modal && !modal.classList.contains('hidden')) closeModal();
  }
});

// =====================================================
// START
// =====================================================

document.addEventListener('DOMContentLoaded', boot);
