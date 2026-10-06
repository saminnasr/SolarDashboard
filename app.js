// =====================================================
// SUPABASE CLIENT
// =====================================================

let client = null;


// =====================================================
// STATE
// =====================================================

const S = {

  user: null,

  isAdmin: false,

  profile: null,

  tenders: [],

  filtered: [],

  editingId: null,

  editMode: false,

  realtimeChannel: null

};


// =====================================================
// HELPERS
// =====================================================

const $ = (id) =>
  document.getElementById(id);


function initSupabase() {

  if (
    typeof APP_CONFIG === 'undefined' ||
    !APP_CONFIG.SUPABASE_URL ||
    !APP_CONFIG.SUPABASE_KEY
  ) {

    console.error(
      'APP_CONFIG is missing.'
    );

    return false;
  }


  client = supabase.createClient(
    APP_CONFIG.SUPABASE_URL,
    APP_CONFIG.SUPABASE_KEY
  );


  return true;
}


function fa(value) {

  return String(value ?? '').replace(
    /\d/g,
    (d) => '۰۱۲۳۴۵۶۷۸۹'[d]
  );

}


function norm(value) {

  return String(value ?? '')
    .trim()
    .toLowerCase();

}


function esc(value) {

  return String(value ?? '').replace(
    /[&<>"']/g,
    (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m])
  );

}


// =====================================================
// TOAST
// =====================================================

function toast(message) {

  const el = $('toast');

  if (!el) {

    console.log(message);

    return;
  }


  el.textContent = message;

  el.classList.add('show');


  setTimeout(() => {

    el.classList.remove('show');

  }, 2500);

}


// =====================================================
// LOGIN / APP VIEW
// =====================================================

function showLogin() {

  $('loginView')?.classList.remove(
    'hidden'
  );

  $('appView')?.classList.add(
    'hidden'
  );

}


function hideLogin() {

  $('loginView')?.classList.add(
    'hidden'
  );

  $('appView')?.classList.remove(
    'hidden'
  );

}


// =====================================================
// LOGIN
// =====================================================

async function handleLogin(event) {

  event.preventDefault();


  const email =
    $('email')?.value.trim();

  const password =
    $('password')?.value;

  const errorBox =
    $('loginError');

  const loginBtn =
    $('loginBtn');


  if (errorBox) {

    errorBox.textContent = '';

  }


  if (!email || !password) {

    if (errorBox) {

      errorBox.textContent =
        'ایمیل و رمز عبور را وارد کنید.';

    }

    return;
  }


  if (loginBtn) {

    loginBtn.disabled = true;

    loginBtn.textContent =
      'در حال ورود...';

  }


  try {

    const {
      data,
      error
    } = await client.auth.signInWithPassword({

      email,

      password

    });


    if (error) {

      console.error(
        'LOGIN ERROR:',
        error
      );


      if (errorBox) {

        if (
          error.message?.includes(
            'Invalid login credentials'
          )
        ) {

          errorBox.textContent =
            'ایمیل یا رمز عبور اشتباه است.';

        } else {

          errorBox.textContent =
            error.message ||
            'خطا در ورود به سامانه.';

        }

      }

      return;
    }


    if (data?.user) {

      await loginUser(
        data.user
      );

    }

  }

  catch (error) {

    console.error(
      'LOGIN EXCEPTION:',
      error
    );


    if (errorBox) {

      errorBox.textContent =
        'خطایی در برقراری ارتباط با سامانه رخ داد.';

    }

  }

  finally {

    if (loginBtn) {

      loginBtn.disabled = false;

      loginBtn.textContent =
        'ورود';

    }

  }

}


// =====================================================
// LOGIN USER
// =====================================================

async function loginUser(user) {

  if (!user) return;


  S.user = user;

  S.isAdmin = false;

  S.profile = null;


  console.log(
    'Logged in:',
    user.email
  );


  try {

    const {
      data: profile,
      error
    } = await client
      .from('profiles')
      .select(
        'id, full_name, is_admin'
      )
      .eq(
        'id',
        user.id
      )
      .maybeSingle();


    if (error) {

      console.error(
        'PROFILE ERROR:',
        error
      );


      toast(
        'حساب وارد شد، اما سطح دسترسی مشخص نشد.'
      );

    }

    else {

      S.profile = profile;

      S.isAdmin =
        profile?.is_admin === true;

    }

  }

  catch (error) {

    console.error(
      'PROFILE EXCEPTION:',
      error
    );

    S.isAdmin = false;

  }


  console.log(
    'IS ADMIN:',
    S.isAdmin
  );


  hideLogin();

  updateAdminUI();

  await load();

}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

  try {

    const {
      error
    } = await client.auth.signOut();


    if (error) {

      console.error(
        'LOGOUT ERROR:',
        error
      );

      toast(
        'خطا در خروج از حساب'
      );

      return;
    }


    S.user = null;

    S.profile = null;

    S.isAdmin = false;

    S.editMode = false;

    S.editingId = null;


    showLogin();

    updateAdminUI();


    if ($('email')) {

      $('email').value = '';

    }


    if ($('password')) {

      $('password').value = '';

    }

  }

  catch (error) {

    console.error(
      'LOGOUT EXCEPTION:',
      error
    );

  }

}


// =====================================================
// ADMIN UI
// =====================================================

function updateAdminUI() {

  document
    .querySelectorAll('.admin')
    .forEach((el) => {

      el.classList.toggle(
        'hidden',
        !S.isAdmin
      );

    });


  document
    .querySelectorAll('.admin-col')
    .forEach((el) => {

      el.classList.toggle(
        'hidden',
        !S.isAdmin ||
        !S.editMode
      );

    });


  if (!S.isAdmin) {

    S.editMode = false;

  }


  const editButton =
    $('editModeBtn');


  if (editButton) {

    editButton.textContent =
      S.editMode
        ? '✓ اتمام ویرایش'
        : '✎ ویرایش جدول';

  }

}


// =====================================================
// TOGGLE EDIT MODE
// =====================================================

function toggleEditMode() {

  if (!S.isAdmin) {

    toast(
      'دسترسی مدیر لازم است.'
    );

    return;
  }


  S.editMode =
    !S.editMode;


  updateAdminUI();

  render();

}


// =====================================================
// BOOT
// =====================================================

async function boot() {

  console.log(
    'Tender Tracker Starting...'
  );


  if (!initSupabase()) {

    showLogin();

    if ($('loginError')) {

      $('loginError').textContent =
        'تنظیمات config.js صحیح نیست.';

    }

    return;

  }


  showLogin();


  try {

    const {
      data,
      error
    } = await client.auth.getSession();


    if (error) {

      console.error(
        'GET SESSION ERROR:',
        error
      );

      return;

    }


    const session =
      data?.session;


    if (session?.user) {

      await loginUser(
        session.user
      );

    }

    else {

      showLogin();

    }

  }

  catch (error) {

    console.error(
      'BOOT ERROR:',
      error
    );

  }


  client.auth.onAuthStateChange(
    async (event, session) => {

      console.log(
        'AUTH EVENT:',
        event
      );


      if (
        event === 'SIGNED_IN' &&
        session?.user
      ) {

        await loginUser(
          session.user
        );

      }


      if (
        event === 'SIGNED_OUT'
      ) {

        S.user = null;

        S.profile = null;

        S.isAdmin = false;

        S.editMode = false;

        showLogin();

        updateAdminUI();

      }

    }
  );

}


// =====================================================
// LOAD TENDERS
// =====================================================

async function load() {

  if (!client) {

    console.error(
      'LOAD ERROR: Supabase client is not initialized.'
    );

    return false;
  }


  console.log(
    'Loading tenders...'
  );


  try {

    const {
      data,
      error
    } = await client
      .from('power_tenders')
      .select('*')
      .order(
        'created_at',
        {
          ascending: true
        }
      );


    if (error) {

      console.error(
        'LOAD ERROR:',
        error
      );

      toast(
        'خطا در دریافت اطلاعات: ' +
        error.message
      );

      return false;
    }


    S.tenders =
      Array.isArray(data)
        ? data
        : [];


    apply();


    if ($('lastUpdated')) {

      $('lastUpdated').textContent =
        'آخرین بروزرسانی: ' +
        new Date().toLocaleString(
          'fa-IR'
        );

    }


    return true;

  }

  catch (error) {

    console.error(
      'LOAD EXCEPTION:',
      error
    );

    toast(
      'خطا در دریافت اطلاعات از پایگاه داده.'
    );

    return false;

  }

}


// =====================================================
// FILTER
// =====================================================

function apply() {

  const search =
    norm(
      $('searchInput')?.value
    );


  const stage =
    norm(
      $('stageFilter')?.value
    );


  const result =
    norm(
      $('resultFilter')?.value
    );


  S.filtered =
    S.tenders.filter((t) => {


      const searchable =
        norm(
          [
            t.tender_name,
            t.employer,
            t.consultant,
            t.proposer,
            t.tender_number,
            t.tender_date,
            t.notes
          ]
            .filter(Boolean)
            .join(' ')
        );


      const matchesSearch =
        !search ||
        searchable.includes(
          search
        );


      const matchesStage =
        !stage ||
        norm(
          t.follow_up_stage
        ).includes(
          stage
        );


      const matchesResult =
        !result ||
        norm(
          t.final_result
        ).includes(
          result
        );


      return (
        matchesSearch &&
        matchesStage &&
        matchesResult
      );

    });


  render();

  stats();

}


// =====================================================
// CLEAR FILTERS
// =====================================================

function clearFilters() {

  if ($('searchInput')) {

    $('searchInput').value = '';

  }


  if ($('stageFilter')) {

    $('stageFilter').value = '';

  }


  if ($('resultFilter')) {

    $('resultFilter').value = '';

  }


  apply();

}


// =====================================================
// RENDER
// =====================================================

function render() {

  const body =
    $('tenderBody');


  if (!body) return;


  if ($('rowCount')) {

    $('rowCount').textContent =
      fa(
        S.filtered.length
      ) +
      ' مورد';

  }


  if (!S.filtered.length) {

    body.innerHTML = `
      <tr>
        <td
          colspan="12"
          style="
            text-align:center;
            padding:45px;
          "
        >
          موردی برای نمایش وجود ندارد.
        </td>
      </tr>
    `;

    return;
  }


  body.innerHTML =
    S.filtered
      .map((t) => {


        const proposerCell =
          S.isAdmin
            ? `
              <td>
                ${esc(
                  t.proposer ||
                  '—'
                )}
              </td>
            `
            : '';


        const notesCell =
          S.isAdmin
            ? `
              <td class="notes-cell">
                ${esc(
                  t.notes ||
                  '—'
                )}
              </td>
            `
            : '';


        const adminActionsCell =
          (
            S.isAdmin &&
            S.editMode
          )
            ? `
              <td class="actions-cell">

                <button
                  type="button"
                  onclick="editTender('${esc(t.id)}')"
                >
                  ویرایش
                </button>

                <button
                  type="button"
                  onclick="deleteTender('${esc(t.id)}')"
                >
                  حذف
                </button>

              </td>
            `
            : '';


        return `
          <tr>

            <td class="project-cell">
              <strong>
                ${esc(
                  t.tender_name
                )}
              </strong>
            </td>

            <td class="number-cell">
              ${esc(
                fa(
                  t.capacity_mw
                )
              )}
            </td>

            <td>
              ${esc(
                t.employer
              )}
            </td>

            <td>
              ${esc(
                t.consultant
              )}
            </td>

            <td class="number-cell">
              ${esc(
                fa(
                  t.tonnage
                )
              )}
            </td>

            ${proposerCell}

            <td class="date-cell">
              ${esc(
                t.tender_date
              )}
            </td>

            ${notesCell}

            <td>
              <span class="badge stage-badge">
                ${esc(
                  t.follow_up_stage ||
                  '—'
                )}
              </span>
            </td>

            <td>
              <span class="badge result-badge">
                ${esc(
                  t.final_result ||
                  '—'
                )}
              </span>
            </td>

            <td>
              ${esc(
                t.tender_number
              )}
            </td>

            ${adminActionsCell}

          </tr>
        `;

      })
      .join('');

}


// =====================================================
// STATISTICS
// =====================================================

function stats() {

  const total =
    S.tenders.length;


  const won =
    S.tenders.filter(
      (t) =>
        norm(
          t.final_result
        ).includes(
          'برنده'
        )
    ).length;


  let capacity = 0;


  S.tenders.forEach(
    (t) => {

      const number =
        parseFloat(
          String(
            t.capacity_mw ||
            ''
          )
        );


      if (!isNaN(number)) {

        capacity += number;

      }

    }
  );


  const tracking =
    S.tenders.filter(
      (t) =>
        t.follow_up_stage &&
        t.follow_up_stage !== '-'
    ).length;


  const upcoming =
    S.tenders.filter(
      (t) =>
        !t.final_result ||
        String(
          t.final_result
        ).trim() === ''
    ).length;


  if ($('statTotal')) {

    $('statTotal').textContent =
      fa(
        total
      );

  }


  if ($('statWon')) {

    $('statWon').textContent =
      fa(
        won
      );

  }


  if ($('statCapacity')) {

    $('statCapacity').textContent =
      fa(
        capacity.toFixed(
          1
        )
      ) +
      ' MW';

  }


  if ($('statTracking')) {

    $('statTracking').textContent =
      fa(
        tracking
      );

  }


  if ($('statUpcoming')) {

    $('statUpcoming').textContent =
      fa(
        upcoming
      );

  }

}


// =====================================================
// OPEN MODAL
// =====================================================

function openModal(
  tender = null
) {

  if (!S.isAdmin) {

    toast(
      'برای ویرایش باید به عنوان مدیر وارد شوید.'
    );

    return;

  }


  S.editingId =
    tender?.id ||
    null;


  const modalTitle =
    $('modalTitle');


  if (modalTitle) {

    modalTitle.textContent =
      tender
        ? 'ویرایش مناقصه'
        : 'مناقصه جدید';

  }


  if ($('fName')) {

    $('fName').value =
      tender?.tender_name ||
      '';

  }


  if ($('fCapacity')) {

    $('fCapacity').value =
      tender?.capacity_mw ??
      '';

  }


  if ($('fEmployer')) {

    $('fEmployer').value =
      tender?.employer ||
      '';

  }


  if ($('fConsultant')) {

    $('fConsultant').value =
      tender?.consultant ||
      '';

  }


  if ($('fTonnage')) {

    $('fTonnage').value =
      tender?.tonnage ??
      '';

  }


  if ($('fBidder')) {

    $('fBidder').value =
      tender?.proposer ||
      '';

  }


  if ($('fTime')) {

    $('fTime').value =
      tender?.tender_date ||
      '';

  }


  if ($('fNumber')) {

    $('fNumber').value =
      tender?.tender_number ||
      '';

  }


  if ($('fStage')) {

    $('fStage').value =
      tender?.follow_up_stage ||
      '';

  }


  if ($('fResult')) {

    $('fResult').value =
      tender?.final_result ||
      '';

  }


  if ($('fNotes')) {

    $('fNotes').value =
      tender?.notes ||
      '';

  }


  $('modal')?.classList.remove(
    'hidden'
  );

}


// =====================================================
// CLOSE MODAL
// =====================================================

function closeModal() {

  $('modal')?.classList.add(
    'hidden'
  );


  S.editingId =
    null;

}


// =====================================================
// SAVE
// =====================================================

async function save(event) {

  event?.preventDefault();


  if (!S.isAdmin) {

    toast(
      'شما دسترسی ویرایش ندارید.'
    );

    return;
  }


  if (!client) {

    toast(
      'ارتباط با پایگاه داده برقرار نیست.'
    );

    console.error(
      'SAVE ERROR: Supabase client is not initialized.'
    );

    return;
  }


  /*
   * نکته مهم:
   * ID را قبل از closeModal ذخیره می‌کنیم.
   * چون closeModal مقدار S.editingId را null می‌کند.
   */
  const editingId =
    S.editingId;


  // ===================================================
  // TEXT VALUE
  // ===================================================

  const textValue =
    (id) => {

      const value =
        $(id)?.value;


      if (
        value === undefined ||
        value === null
      ) {

        return null;

      }


      const cleaned =
        String(
          value
        ).trim();


      return cleaned === ''
        ? null
        : cleaned;

    };


  // ===================================================
  // NUMBER VALUE
  // ===================================================

  const numberValue =
    (id) => {

      const raw =
        $(id)?.value;


      if (
        raw === undefined ||
        raw === null
      ) {

        return null;

      }


      const rawString =
        String(
          raw
        ).trim();


      if (
        rawString === ''
      ) {

        return null;

      }


      /*
       * تبدیل اعداد فارسی:
       * ۱۲۳۴۵۶۷۸۹۰
       *
       * و اعداد عربی:
       * ١٢٣٤٥٦٧٨٩٠
       */

      const normalized =
        rawString
          .replace(
            /[۰-۹]/g,
            (d) =>
              '۰۱۲۳۴۵۶۷۸۹'
                .indexOf(d)
          )
          .replace(
            /[٠-٩]/g,
            (d) =>
              '٠١٢٣٤٥٦٧٨٩'
                .indexOf(d)
          )
          .replace(
            /,/g,
            ''
          );


      const number =
        Number(
          normalized
        );


      if (
        !Number.isFinite(
          number
        )
      ) {

        return null;

      }


      return number;

    };


  // ===================================================
  // PAYLOAD
  // ===================================================

  const payload = {

    tender_name:
      textValue(
        'fName'
      ),

    capacity_mw:
      numberValue(
        'fCapacity'
      ),

    employer:
      textValue(
        'fEmployer'
      ),

    consultant:
      textValue(
        'fConsultant'
      ),

    tonnage:
      numberValue(
        'fTonnage'
      ),

    proposer:
      textValue(
        'fBidder'
      ),

    tender_date:
      textValue(
        'fTime'
      ),

    tender_number:
      textValue(
        'fNumber'
      ),

    follow_up_stage:
      textValue(
        'fStage'
      ),

    final_result:
      textValue(
        'fResult'
      ),

    notes:
      textValue(
        'fNotes'
      ),

    updated_at:
      new Date().toISOString()

  };


  console.log(
    '===================================='
  );

  console.log(
    '[Tender Tracker] SAVE START'
  );

  console.log(
    'Mode:',
    editingId
      ? 'UPDATE'
      : 'INSERT'
  );

  console.log(
    'Editing ID:',
    editingId
  );

  console.log(
    'Payload:',
    payload
  );


  try {

    let response;


    // =================================================
    // UPDATE EXISTING TENDER
    // =================================================

    if (editingId) {

      response =
        await client
          .from(
            'power_tenders'
          )
          .update(
            payload
          )
          .eq(
            'id',
            editingId
          )
          .select(
            '*'
          );


    }

    // =================================================
    // INSERT NEW TENDER
    // =================================================

    else {

      response =
        await client
          .from(
            'power_tenders'
          )
          .insert(
            payload
          )
          .select(
            '*'
          );

    }


    console.log(
      'SUPABASE RESPONSE:',
      response
    );


    // =================================================
    // SUPABASE ERROR
    // =================================================

    if (
      response.error
    ) {

      console.error(
        'SAVE ERROR:',
        response.error
      );


      toast(
        'خطا در ذخیره: ' +
        (
          response.error.message ||
          'خطای نامشخص'
        )
      );


      return;

    }


    // =================================================
    // NO ROW RETURNED
    // =================================================

    if (
      !Array.isArray(
        response.data
      ) ||
      response.data.length === 0
    ) {

      console.error(
        'SAVE ERROR: No row was returned after save.',
        {
          editingId,
          payload,
          response
        }
      );


      if (
        editingId
      ) {

        toast(
          'ذخیره انجام نشد؛ رکورد پیدا نشد یا دسترسی UPDATE ندارید.'
        );

      }

      else {

        toast(
          'رکورد جدید ایجاد نشد.'
        );

      }


      return;

    }


    // =================================================
    // SUCCESS
    // =================================================

    const savedRow =
      response.data[0];


    console.log(
      'SAVED ROW:',
      savedRow
    );


    // =================================================
    // UPDATE LOCAL STATE
    // =================================================

    if (
      editingId
    ) {

      const index =
        S.tenders.findIndex(
          (t) =>
            String(
              t.id
            ) ===
            String(
              editingId
            )
        );


      if (
        index !== -1
      ) {

        S.tenders[index] =
          savedRow;

      }

    }

    else {

      S.tenders.push(
        savedRow
      );

    }


    // =================================================
    // CLOSE + RENDER
    // =================================================

    closeModal();

    apply();


    // =================================================
    // RELOAD FROM DATABASE
    // =================================================

    await load();


    toast(
      editingId
        ? 'اطلاعات مناقصه با موفقیت ویرایش و ذخیره شد.'
        : 'مناقصه جدید با موفقیت ثبت شد.'
    );


  }

  catch (
    error
  ) {

    console.error(
      'SAVE EXCEPTION:',
      error
    );


    toast(
      'خطای غیرمنتظره هنگام ذخیره اطلاعات.'
    );

  }

}


// =====================================================
// EDIT
// =====================================================

window.editTender =
  function(id) {

    if (!S.isAdmin) {

      toast(
        'دسترسی مدیر لازم است.'
      );

      return;

    }


    const tender =
      S.tenders.find(
        (t) =>
          String(
            t.id
          ) ===
          String(
            id
          )
      );


    if (!tender) {

      console.error(
        'EDIT ERROR: Tender not found.',
        {
          id,
          tenders: S.tenders
        }
      );


      toast(
        'مناقصه موردنظر پیدا نشد.'
      );


      return;

    }


    openModal(
      tender
    );

  };


// =====================================================
// DELETE
// =====================================================

window.deleteTender =
  async function(id) {

    if (!S.isAdmin) {

      toast(
        'دسترسی مدیر لازم است.'
      );

      return;

    }


    if (
      !id
    ) {

      toast(
        'شناسه مناقصه نامعتبر است.'
      );

      return;

    }


    if (
      !confirm(
        'این مناقصه حذف شود؟'
      )
    ) {

      return;

    }


    try {

      const {
        data,
        error
      } =
        await client
          .from(
            'power_tenders'
          )
          .delete()
          .eq(
            'id',
            id
          )
          .select(
            'id'
          );


      if (
        error
      ) {

        console.error(
          'DELETE ERROR:',
          error
        );


        toast(
          'خطا در حذف: ' +
          error.message
        );


        return;

      }


      if (
        !Array.isArray(
          data
        ) ||
        data.length === 0
      ) {

        console.error(
          'DELETE ERROR: No row was deleted.',
          {
            id,
            data
          }
        );


        toast(
          'مناقصه حذف نشد؛ رکورد پیدا نشد یا دسترسی حذف ندارید.'
        );


        return;

      }


      S.tenders =
        S.tenders.filter(
          (t) =>
            String(
              t.id
            ) !==
            String(
              id
            )
        );


      apply();


      await load();


      toast(
        'مناقصه با موفقیت حذف شد.'
      );


    }

    catch (
      error
    ) {

      console.error(
        'DELETE EXCEPTION:',
        error
      );


      toast(
        'خطای غیرمنتظره هنگام حذف.'
      );

    }

  };


// =====================================================
// PDF
// =====================================================

async function pdf() {
  const tableCard = document.querySelector('.table-card');
  const tableScroll = document.querySelector('.table-scroll');
  if (!tableCard || !tableScroll) {
    toast('جدول یافت نشد.');
    return;
  }
  toast('در حال تولید PDF...');

  const now = new Date();
  const currentDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const currentTime = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit', minute: '2-digit'
  }).format(now);

  // هدر موقت
  const headerDiv = document.createElement('div');
  headerDiv.id = 'pdfHeaderTemp';
  headerDiv.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    margin-bottom: 8px;
    border-bottom: 2px solid #000;
    font-family: inherit;
    direction: rtl;
    width: 100%;
    box-sizing: border-box;
  `;
  headerDiv.innerHTML = `
    <div>
      <h2 style="margin:0; font-size:15px;">گزارش مناقصات در دست اقدام واحد تجدیدپذیر</h2>
      <span style="font-size:11px; color:#555;">فهرست پیگیری مناقصات نیروگاهی</span>
    </div>
    <div style="text-align:left; font-size:11px; white-space:nowrap;">
      <div><b>تاریخ گزارش:</b> ${currentDate}</div>
      <div><b>ساعت صدور:</b> ${currentTime}</div>
    </div>
  `;
  tableCard.insertBefore(headerDiv, tableCard.firstChild);

  // مخفی کردن ستون‌های ادمین
  const adminElements = document.querySelectorAll('.admin-col, .admin, #adminActions');
  adminElements.forEach(el => el.style.display = 'none');

  const originalScrollStyle = tableScroll.style.cssText;
  const originalCardStyle = tableCard.style.cssText;

  try {
    // باز کردن کامل
    tableScroll.style.maxHeight = 'none';
    tableScroll.style.overflow = 'visible';
    tableCard.style.maxHeight = 'none';
    tableCard.style.overflow = 'visible';

    const opt = {
      // حاشیه مساوی چپ و راست → جدول وسط می‌شینه
      // عدد بالاتر = فاصله بیشتر از لبه‌ها
      margin: [10, 14, 10, 14],   // top, left, bottom, right (میلی‌متر)

      filename: `گزارش_مناقصات_${currentDate.replace(/\//g, '-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        windowWidth: 1350,          // عرض مناسب برای A3 افقی با حاشیه ۱۴mm
        windowHeight: tableCard.scrollHeight + 40,
        onclone: (clonedDoc) => {
          const clonedCard = clonedDoc.querySelector('.table-card');
          if (!clonedCard) return;

          // کارت رو محدود و وسط‌چین کن
          clonedCard.style.width = '100%';
          clonedCard.style.maxWidth = '1350px';
          clonedCard.style.margin = '0 auto';
          clonedCard.style.boxSizing = 'border-box';
          clonedCard.style.overflow = 'hidden';
          clonedCard.style.padding = '0 4px';

          // جدول
          const table = clonedCard.querySelector('table');
          if (table) {
            table.style.width = '100%';
            table.style.maxWidth = '100%';
            table.style.tableLayout = 'fixed';   // کنترل دقیق عرض ستون‌ها
            table.style.borderCollapse = 'collapse';
            table.style.margin = '0 auto';
          }

          // همه سلول‌ها
          clonedCard.querySelectorAll('th, td').forEach(cell => {
            cell.style.whiteSpace = 'normal';
            cell.style.wordBreak = 'break-word';
            cell.style.overflowWrap = 'break-word';
            cell.style.overflow = 'hidden';
            cell.style.padding = '3px 5px';
            cell.style.fontSize = '10px';
            cell.style.lineHeight = '1.3';
            cell.style.verticalAlign = 'top';
            cell.style.boxSizing = 'border-box';
          });

          // ستون اول (راست‌ترین ستون در RTL) - این معمولاً بریده می‌شد
          clonedCard.querySelectorAll('tr > *:first-child').forEach(cell => {
            cell.style.width = '85px';
            cell.style.minWidth = '75px';
            cell.style.maxWidth = '95px';
            cell.style.fontSize = '9.5px';
          });

          // ستون‌های پهن (ملاحظات و ...) رو محدود کن
          clonedCard.querySelectorAll('tr > *:nth-child(4), tr > *:nth-child(5)').forEach(cell => {
            cell.style.maxWidth = '130px';
          });
        }
      },
      jsPDF: {
        unit: 'mm',
        format: 'a3',
        orientation: 'landscape'
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: ['tr', 'td', 'th', '#pdfHeaderTemp']
      }
    };

    await html2pdf().set(opt).from(tableCard).save();
    toast('فایل PDF با موفقیت دانلود شد.');
  } catch (error) {
    console.error('PDF ERROR:', error);
    toast('خطا در صدور PDF');
  } finally {
    document.getElementById('pdfHeaderTemp')?.remove();
    adminElements.forEach(el => el.style.display = '');
    tableScroll.style.cssText = originalScrollStyle;
    tableCard.style.cssText = originalCardStyle;
  }
}

// =====================================================
// GLOBAL FUNCTIONS
// =====================================================

window.toggleEditMode =
  toggleEditMode;


window.openModal =
  openModal;


window.closeModal =
  closeModal;


window.save =
  save;


window.pdf =
  pdf;


window.logout =
  logout;


window.clearFilters =
  clearFilters;


// =====================================================
// DOM READY
// =====================================================

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const loginForm =
      $('loginForm');


    if (
      loginForm
    ) {

      loginForm.addEventListener(
        'submit',
        handleLogin
      );

    }


    boot();

  }
);
