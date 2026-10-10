// =====================================================
// SUPABASE CLIENT
// =====================================================

let client = null;

const S = {
  user: null,
  isAdmin: false,
  userGroup: null,
  profile: null,
  tenders: [],
  filtered: [],
  editingId: null,
  editMode: false,
  columns: []
};

const $ = id => document.getElementById(id);

const GROUP_A = 'group_a';
const GROUP_B = 'group_b';

// =====================================================
// COLUMN DEFINITIONS
// =====================================================

const COLUMN_DEFS = {
  tender_name:      { label: 'نام مناقصه', groups: ['group_a', 'group_b'], always: true },
  capacity_mw:      { label: 'ظرفیت (MW)', groups: ['group_a', 'group_b'], always: true },
  employer:         { label: 'کارفرما', groups: ['group_a', 'group_b'], always: true },
  consultant:       { label: 'مشاور', groups: ['group_a'], always: false },
  tonnage:          { label: 'تناژ تقریبی (تن)', groups: ['group_a'], always: false },
  proposer:         { label: 'پیشنهاددهنده', groups: ['group_b'], always: false },
  tender_date:      { label: 'زمان مناقصه / پیش‌بینی', groups: ['group_a', 'group_b'], always: true },
  tender_number:    { label: 'شماره مناقصه', groups: ['group_a', 'group_b'], always: true },
  city_province:    { label: 'شهر و استان', groups: ['group_a'], always: false },
  structure_type:   { label: 'نوع سازه', groups: ['group_a'], always: false },
  wind_snow:        { label: 'بار باد و بار برف', groups: ['group_a'], always: false },
  structure_weight: { label: 'وزن سازه', groups: ['group_a'], always: false },
  notes:            { label: 'ملاحظات', groups: ['group_b'], always: false },
  follow_up_stage:  { label: 'مرحله پیگیری', groups: ['group_b'], always: false },
  proposed_price:   { label: 'قیمت پیشنهادی', groups: ['group_b'], always: false },
  final_result:     { label: 'نتیجه نهایی', groups: [], always: false }
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
      'tonnage', 'tender_date', 'tender_number', 'city_province',
      'structure_type', 'wind_snow', 'structure_weight'
    ];
  }

  if (S.userGroup === GROUP_B) {
    return [
      'tender_name', 'capacity_mw', 'employer', 'proposer',
      'tender_date', 'tender_number', 'notes', 'follow_up_stage',
      'proposed_price'
    ];
  }

  return [];
}

function cellValue(t, key) {
  switch (key) {
    case 'city_province':
      return [t.city, t.province].filter(Boolean).join('، ') || '—';
    case 'wind_snow':
      return [
        t.wind_load ? `باد: ${t.wind_load}` : '',
        t.snow_load ? `برف: ${t.snow_load}` : ''
      ].filter(Boolean).join(' | ') || '—';
    default:
      return t[key] ?? '—';
  }
}

// =====================================================
// HELPERS
// =====================================================

function fa(value) {
  return String(value ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function initSupabase() {
  if (
    typeof APP_CONFIG === 'undefined' ||
    !APP_CONFIG.SUPABASE_URL ||
    !APP_CONFIG.SUPABASE_KEY
  ) {
    console.error('APP_CONFIG is missing.');
    return false;
  }

  client = supabase.createClient(
    APP_CONFIG.SUPABASE_URL,
    APP_CONFIG.SUPABASE_KEY
  );

  return true;
}

function toast(message) {
  const el = $('toast');
  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => el.classList.remove('show'), 3000);
}

function showLogin() {
  $('loginView')?.classList.remove('hidden');
  $('appView')?.classList.add('hidden');
}

function hideLogin() {
  $('loginView')?.classList.add('hidden');
  $('appView')?.classList.remove('hidden');
}

// =====================================================
// LOGIN
// =====================================================

async function handleLogin(event) {
  event.preventDefault();

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

    if (data?.user) {
      await loginUser(data.user);
    }
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

async function loginUser(user) {
  if (!user || !client) return;

  S.user = user;
  S.isAdmin = false;
  S.userGroup = null;
  S.profile = null;
  S.editMode = false;

  try {
    const { data: profile, error } = await client
      .from('profiles')
      .select('id, full_name, is_admin, user_group')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!profile) {
      throw new Error('برای این حساب، پروفایل کاربری ثبت نشده است.');
    }

    S.profile = profile;
    S.isAdmin = profile.is_admin === true;
    S.userGroup = profile.user_group;

    if (!S.isAdmin && ![GROUP_A, GROUP_B].includes(S.userGroup)) {
      throw new Error('گروه کاربری شما مشخص نیست. با مدیر سامانه تماس بگیرید.');
    }

    S.columns = visibleColumns();

    hideLogin();
    updateAdminUI();
    buildTableHeaders();
    configureFilters();
    configureStats();
    await load();

  } catch (error) {
    console.error('PROFILE ERROR:', error);
    toast(error.message || 'سطح دسترسی کاربر مشخص نشد.');
    await client.auth.signOut();
    showLogin();
  }
}

// =====================================================
// LOGOUT
// =====================================================

async function logout() {
  if (!client) return;

  const { error } = await client.auth.signOut();

  if (error) {
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
  S.editMode = false;
  S.editingId = null;
  S.columns = [];

  updateAdminUI();

  if ($('email')) $('email').value = '';
  if ($('password')) $('password').value = '';
}

// =====================================================
// ADMIN CONTROLS
// =====================================================

function updateAdminUI() {
  document.querySelectorAll('.admin').forEach(el => {
    el.classList.toggle('hidden', !S.isAdmin);
  });

  const editButton = $('editModeBtn');
  if (editButton) {
    editButton.textContent = S.editMode
      ? '✓ اتمام ویرایش'
      : '✎ ویرایش جدول';
  }

  const title = document.querySelector('.table-head h2');
  if (title) {
    title.textContent = S.isAdmin
      ? 'جدول کامل مناقصات'
      : S.userGroup === GROUP_A
        ? 'جدول مناقصات - گروه فنی'
        : 'جدول مناقصات - گروه بازرگانی';
  }

  const reportTitle = document.querySelector('.report-title h2');
  if (reportTitle) {
    reportTitle.textContent = S.isAdmin
      ? 'مناقصات در دست اقدام واحد تجدیدپذیر'
      : 'گزارش مناقصات';
  }
}

function toggleEditMode() {
  if (!S.isAdmin) {
    toast('دسترسی مدیر لازم است.');
    return;
  }

  S.editMode = !S.editMode;
  updateAdminUI();
  buildTableHeaders();
  render();
}

// =====================================================
// TABLE HEADERS
// =====================================================

function buildTableHeaders() {
  const thead = document.querySelector('table thead');
  if (!thead) return;

  const headers = S.columns.map(key =>
    `<th>${esc(COLUMN_DEFS[key].label)}</th>`
  );

  if (S.isAdmin && S.editMode) {
    headers.push('<th class="admin-col">عملیات</th>');
  }

  thead.innerHTML = `<tr>${headers.join('')}</tr>`;
}

// =====================================================
// FILTER VISIBILITY
// =====================================================

function configureFilters() {
  const stage = $('stageFilter');
  const result = $('resultFilter');

  if (stage) {
    stage.classList.toggle(
      'hidden',
      !S.isAdmin && S.userGroup !== GROUP_B
    );
  }

  if (result) {
    result.classList.toggle('hidden', !S.isAdmin);
  }

  const search = $('searchInput');
  if (search) {
    search.placeholder = 'جستجو در ستون‌های قابل مشاهده...';
  }
}

// =====================================================
// STATISTICS VISIBILITY
// =====================================================

function configureStats() {
  const statVisibility = {
    statTotal: true,
    statTracking: S.isAdmin || S.userGroup === GROUP_B,
    statWon: S.isAdmin,
    statCapacity: true,
    statUpcoming: S.isAdmin
  };

  for (const [id, visible] of Object.entries(statVisibility)) {
    const el = $(id);
    if (el) {
      const card = el.closest('.stats > div') || el.parentElement;
      if (card) card.classList.toggle('hidden', !visible);
    }
  }
}

// =====================================================
// BOOT
// =====================================================

async function boot() {
  if (!initSupabase()) {
    showLogin();
    if ($('loginError')) {
      $('loginError').textContent = 'تنظیمات config.js صحیح نیست.';
    }
    return;
  }

  showLogin();

  const { data, error } = await client.auth.getSession();

  if (error) {
    console.error('SESSION ERROR:', error);
    return;
  }

  if (data?.session?.user) {
    await loginUser(data.session.user);
  }

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      resetUserState();
      showLogin();
    }
  });
}

// =====================================================
// LOAD DATA THROUGH SECURE RPC
// =====================================================

async function load() {
  if (!client || !S.user) return false;

  try {
    const { data, error } = await client.rpc('get_visible_tenders');

    if (error) throw error;

    S.tenders = Array.isArray(data) ? data : [];

    apply();

    if ($('lastUpdated')) {
      $('lastUpdated').textContent =
        'آخرین بروزرسانی: ' +
        new Date().toLocaleString('fa-IR');
    }

    return true;
  } catch (error) {
    console.error('LOAD ERROR:', error);
    toast('خطا در دریافت اطلاعات: ' + error.message);
    return false;
  }
}

// =====================================================
// FILTER
// =====================================================

function apply() {
  const search = norm($('searchInput')?.value);
  const stage = norm($('stageFilter')?.value);
  const result = norm($('resultFilter')?.value);

  S.filtered = S.tenders.filter(t => {
    const searchable = S.columns
      .map(key => cellValue(t, key))
      .join(' ');

    const matchesSearch = !search || norm(searchable).includes(search);

    const matchesStage =
      !stage || norm(t.follow_up_stage).includes(stage);

    const matchesResult =
      !S.isAdmin ||
      !result ||
      norm(t.final_result).includes(result);

    return matchesSearch && matchesStage && matchesResult;
  });

  render();
  stats();
}

function clearFilters() {
  if ($('searchInput')) $('searchInput').value = '';
  if ($('stageFilter')) $('stageFilter').value = '';
  if ($('resultFilter')) $('resultFilter').value = '';
  apply();
}

// =====================================================
// RENDER TABLE
// =====================================================

function render() {
  const body = $('tenderBody');
  if (!body) return;

  if ($('rowCount')) {
    $('rowCount').textContent = fa(S.filtered.length) + ' مورد';
  }

  if (!S.filtered.length) {
    const count = S.columns.length + (S.isAdmin && S.editMode ? 1 : 0);
    body.innerHTML = `
      <tr>
        <td colspan="${count}" style="text-align:center;padding:45px">
          موردی برای نمایش وجود ندارد.
        </td>
      </tr>`;
    return;
  }

  body.innerHTML = S.filtered.map(t => {
    const cells = S.columns.map(key => {
      const value = cellValue(t, key);
      const className =
        key === 'tender_name' ? 'project-cell' :
        ['capacity_mw', 'tonnage', 'proposed_price'].includes(key) ? 'number-cell' :
        key === 'tender_date' ? 'date-cell' :
        key === 'notes' ? 'notes-cell' : '';

      const content =
        key === 'follow_up_stage'
          ? `<span class="badge stage-badge">${esc(value)}</span>`
          : key === 'final_result'
            ? `<span class="badge result-badge">${esc(value)}</span>`
            : esc(value);

      return `<td class="${className}">${content}</td>`;
    });

    if (S.isAdmin && S.editMode) {
      cells.push(`
        <td class="actions-cell">
          <button type="button" onclick="editTender('${esc(t.id)}')">ویرایش</button>
          <button type="button" onclick="deleteTender('${esc(t.id)}')">حذف</button>
        </td>`);
    }

    return `<tr>${cells.join('')}</tr>`;
  }).join('');
}

// =====================================================
// STATISTICS
// =====================================================

function stats() {
  const total = S.tenders.length;

  const won = S.isAdmin
    ? S.tenders.filter(t => norm(t.final_result).includes('برنده')).length
    : 0;

  const tracking = S.userGroup === GROUP_B || S.isAdmin
    ? S.tenders.filter(t => t.follow_up_stage && t.follow_up_stage !== '-').length
    : 0;

  const upcoming = S.isAdmin
    ? S.tenders.filter(t => !String(t.final_result || '').trim()).length
    : 0;

  let capacity = 0;
  S.tenders.forEach(t => {
    // ظرفیت متنی نگهداری می‌شود؛ اینجا فقط مقدار عددی ساده جمع می‌شود.
    const raw = String(t.capacity_mw || '').trim();
    if (/^\d+(\.\d+)?$/.test(raw)) capacity += Number(raw);
  });

  if ($('statTotal')) $('statTotal').textContent = fa(total);
  if ($('statTracking')) $('statTracking').textContent = fa(tracking);
  if ($('statWon')) $('statWon').textContent = fa(won);
  if ($('statCapacity')) $('statCapacity').textContent = fa(capacity.toFixed(1)) + ' MW';
  if ($('statUpcoming')) $('statUpcoming').textContent = fa(upcoming);
}

// =====================================================
// DYNAMIC ADMIN FORM
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
      <label class="${key === 'notes' ? 'full' : ''}">
        ${esc(label)}
        ${key === 'notes'
          ? `<textarea id="f_${key}" rows="3"></textarea>`
          : `<input id="f_${key}" ${required ? 'required' : ''} autocomplete="off">`}
      </label>
    `).join('')}
    <div class="full modal-actions">
      <button type="button" onclick="closeModal()">انصراف</button>
      <button class="primary" type="submit">ذخیره</button>
    </div>
  `;

  form.dataset.prepared = 'yes';
  form.addEventListener('submit', save);
}

// =====================================================
// OPEN / CLOSE MODAL
// =====================================================

function openModal(tender = null) {
  if (!S.isAdmin) {
    toast('فقط مدیر می‌تواند مناقصه ثبت یا ویرایش کند.');
    return;
  }

  prepareForm();
  S.editingId = tender?.id || null;

  if ($('modalTitle')) {
    $('modalTitle').textContent = tender ? 'ویرایش مناقصه' : 'مناقصه جدید';
  }

  FORM_FIELDS.forEach(([key]) => {
    const input = $(`f_${key}`);
    if (input) input.value = tender?.[key] ?? '';
  });

  $('modal')?.classList.remove('hidden');
}

function closeModal() {
  $('modal')?.classList.add('hidden');
  S.editingId = null;
}

// =====================================================
// SAVE THROUGH SECURE RPC
// =====================================================

async function save(event) {
  event?.preventDefault();

  if (!S.isAdmin) {
    toast('شما اجازه ویرایش ندارید.');
    return;
  }

  const payload = {};

  FORM_FIELDS.forEach(([key]) => {
    const input = $(`f_${key}`);
    payload[key] = input && input.value.trim() !== ''
      ? input.value.trim()
      : null;
  });

  try {
    const { data, error } = await client.rpc('save_tender', {
      p_payload: payload,
      p_tender_id: S.editingId || null
    });

    if (error) throw error;

    closeModal();

    const ok = await load();
    if (ok) {
      toast(S.editingId ? 'مناقصه ویرایش شد.' : 'مناقصه ثبت شد.');
    } else {
      toast('عملیات ذخیره شد، اما بارگذاری مجدد اطلاعات موفق نبود.');
    }
  } catch (error) {
    console.error('SAVE ERROR:', error);
    toast('خطا در ذخیره: ' + error.message);
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

  const tender = S.tenders.find(t => String(t.id) === String(id));

  if (!tender) {
    toast('مناقصه پیدا نشد. جدول را بروزرسانی کنید.');
    return;
  }

  openModal(tender);
};

window.deleteTender = async function(id) {
  if (!S.isAdmin) {
    toast('دسترسی مدیر لازم است.');
    return;
  }

  if (!confirm('این مناقصه حذف شود؟')) return;

  try {
    const { error } = await client.rpc('delete_tender', {
      p_tender_id: id
    });

    if (error) throw error;

    await load();
    toast('مناقصه حذف شد.');
  } catch (error) {
    console.error('DELETE ERROR:', error);
    toast('خطا در حذف: ' + error.message);
  }
};

// =====================================================
// PDF
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

  report.querySelectorAll(
    '#adminActions, .actions-cell, .admin-col'
  ).forEach(el => el.remove());

  // ستون‌های خروجی دقیقاً همان ستون‌های مجاز نمایش‌داده‌شده هستند.
  const host = document.createElement('div');
  host.style.cssText = `
    position:fixed;left:-30000px;top:0;width:1800px;
    background:#fff;color:#222;direction:rtl;
    font-family:Tahoma,sans-serif;padding:20px;
  `;

  report.style.cssText = `
    display:block;width:100%;max-width:none;
    height:auto;overflow:visible;background:#fff;
  `;

  const table = report.querySelector('table');
  if (table) {
    table.style.cssText = 'width:100%;border-collapse:collapse;direction:rtl;';

    table.querySelectorAll('th').forEach(th => {
      th.style.cssText =
        'background:#505355;color:#fff;border:1px solid #999;padding:8px;text-align:center;';
    });

    table.querySelectorAll('td').forEach(td => {
      td.style.cssText =
        'border:1px solid #ccc;padding:8px;vertical-align:top;word-break:break-word;';
    });
  }

  const now = new Date();
  const date = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);

  const heading = document.createElement('h2');
  heading.textContent = S.isAdmin
    ? 'گزارش کامل مناقصات'
    : S.userGroup === GROUP_A
      ? 'گزارش مناقصات - گروه فنی'
      : 'گزارش مناقصات - گروه بازرگانی';

  heading.style.cssText = 'text-align:center;margin:0 0 12px;';

  const dateLine = document.createElement('p');
  dateLine.textContent = `تاریخ گزارش: ${date}`;
  dateLine.style.cssText = 'text-align:left;';

  report.querySelector('.report-title')?.remove();
  report.insertBefore(dateLine, report.firstChild);
  report.insertBefore(heading, report.firstChild);

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
      }
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
// GLOBAL FUNCTIONS USED BY HTML
// =====================================================

window.toggleEditMode = toggleEditMode;
window.openModal = openModal;
window.closeModal = closeModal;
window.save = save;
window.pdf = pdf;
window.logout = logout;
window.load = load;
window.apply = apply;
window.clearFilters = clearFilters;

// =====================================================
// DOM READY
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = $('loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const form = $('tenderForm');
  if (form) {
    // The form fields are generated dynamically when the admin opens it.
    form.addEventListener('submit', save);
  }

  boot();
});
