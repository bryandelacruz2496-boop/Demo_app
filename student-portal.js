const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';
const UPLOADS_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
let currentStudent = null;

// Helper: resolve image URL (handles both Cloudinary full URLs and local /uploads/ paths)
function imgUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return UPLOADS_URL + path;
}

// Prevent browser back/forward button from navigating away
history.pushState(null, null, location.href);
window.addEventListener('popstate', function () {
  history.pushState(null, null, location.href);
});

// Check if already logged in - show cached data immediately
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const token = localStorage.getItem('studentToken');
    const savedStudent = localStorage.getItem('studentData');

    if (!token || !savedStudent) return;

    const parsed = JSON.parse(savedStudent);
    if (!parsed || !parsed.fullName) return;

    // Show dashboard immediately with cached data
    currentStudent = parsed;

    // Check if must change password
    if (parsed.mustChangePassword) {
      document.getElementById('loginWrapper').style.display = 'none';
      document.getElementById('changePwOverlay').style.display = 'flex';
      return;
    }

    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    populateDashboard();
    startSessionCheck();
    startStudentNotificationCheck();

    // Then try to refresh in background
    fetch(`${API_URL}/student/refresh`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => {
      if (res.status === 401 || res.status === 404) {
        // Session expired or student deleted
        alert('Your session has ended. Your account may have been logged in on another device or removed.');
        logout();
        return null;
      }
      if (res.ok) return res.json();
      return null;
    }).then(data => {
      if (data && data.student) {
        currentStudent = data.student;
        localStorage.setItem('studentData', JSON.stringify(data.student));
        populateDashboard();
      }
    }).catch(() => { });
  } catch (e) {
    // If anything fails, stay on login
  }
});

async function handleStudentLogin(event) {
  event.preventDefault();
  const studentNo = document.getElementById('studentId').value.trim();
  const password = document.getElementById('studentPassword').value;
  const errorEl = document.getElementById('loginError');
  const loginBtn = document.querySelector('.btn-login');
  const loginForm = document.querySelector('.login-left form');

  // Show loading state
  const originalText = loginBtn.textContent;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="btn-spinner"></span> Logging in...';
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_URL}/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentNo, password })
    });

    const data = await res.json();

    if (res.ok) {
      currentStudent = data.student;
      localStorage.setItem('studentToken', data.token);
      localStorage.setItem('studentData', JSON.stringify(data.student));
      errorEl.textContent = '';

      // Show success state on button
      loginBtn.innerHTML = '✓ Login Successful!';
      loginBtn.classList.add('btn-login-success');

      // Show success notification
      showLoginNotification('✓ Welcome, ' + (data.student.fullName || 'Student') + '!');

      // Brief delay then proceed
      setTimeout(() => {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
        loginBtn.classList.remove('btn-login-success');

        if (data.student.mustChangePassword) {
          document.getElementById('loginWrapper').style.display = 'none';
          document.getElementById('changePwOverlay').style.display = 'flex';
        } else {
          showDashboard();
          startSessionCheck();
          startStudentNotificationCheck();
        }
      }, 1200);
    } else {
      // Reset button
      loginBtn.disabled = false;
      loginBtn.innerHTML = originalText;
      errorEl.textContent = data.message;

      // Shake animation
      loginForm.classList.add('shake');
      setTimeout(() => loginForm.classList.remove('shake'), 600);
    }
  } catch (err) {
    loginBtn.disabled = false;
    loginBtn.innerHTML = originalText;
    errorEl.textContent = 'Cannot connect to server. Please try again.';

    // Shake animation
    loginForm.classList.add('shake');
    setTimeout(() => loginForm.classList.remove('shake'), 600);
  }
}

function showLoginNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'login-success-notif';
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => { if (notif.parentElement) notif.remove(); }, 3000);
}

function showDashboard() {
  if (!currentStudent) return;
  document.getElementById('loginWrapper').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  populateDashboard();
}

function populateDashboard() {
  if (!currentStudent) return;

  // Populate info
  document.getElementById('dashStudentName').textContent = currentStudent.fullName || '';
  document.getElementById('infoFullName').textContent = currentStudent.fullName || '';
  document.getElementById('infoStudentNo').textContent = currentStudent.studentNo || '';
  document.getElementById('infoGrade').textContent = currentStudent.grade || '';
  document.getElementById('infoGuardian').textContent = currentStudent.guardian || '';

  // Set profile image
  const avatarEl = document.querySelector('.info-avatar');
  if (currentStudent.profileImage) {
    avatarEl.innerHTML = `<img src="${imgUrl(currentStudent.profileImage)}" style="width:110px;height:110px;border-radius:50%;object-fit:cover;">
    <label class="avatar-upload-btn" title="Change photo">
      📷
      <input type="file" id="studentPhotoUpload" accept="image/*" onchange="uploadStudentPhoto(this)" style="display:none;">
    </label>`;
  }

  // Payments
  const totalTuition = currentStudent.totalTuition || 0;
  const totalPaid = currentStudent.totalPaid || 0;
  document.getElementById('totalTuition').textContent = '₱' + totalTuition.toLocaleString();
  document.getElementById('totalPaid').textContent = '₱' + totalPaid.toLocaleString();
  const balance = totalTuition - totalPaid;
  document.getElementById('totalBalance').textContent = '₱' + balance.toLocaleString();

  // Expenses
  const allExpenses = (currentStudent.payments || []).filter(p => p.description && p.description.startsWith('[Expense]'));
  const totalExpenses = allExpenses.reduce((sum, p) => sum + p.amount, 0);
  const pendingExpenses = allExpenses.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
  document.getElementById('totalExpenses').textContent = '₱' + totalExpenses.toLocaleString();
  document.getElementById('totalExpensesPending').textContent = pendingExpenses > 0 ? 'Pending: ₱' + pendingExpenses.toLocaleString() : '';

  renderStudentPayments();
  try { loadStudentAnnouncements(); } catch (e) { }

  // Activities
  const activityList = document.getElementById('activityList');
  activityList.innerHTML = currentStudent.activities.map(a => `
    <div class="activity-card" onclick="toggleActivityDetail(this)">
      <h4>${a.title}</h4>
      <div class="meta">${a.subject} • ${a.date}</div>
      <p>${a.description}</p>
      ${a.imageUrl ? `<div class="activity-photo-wrapper"><img src="${imgUrl(a.imageUrl)}" class="activity-photo" onclick="event.stopPropagation(); openActivityImage('${imgUrl(a.imageUrl)}')"><p class="photo-hint">Click image to enlarge</p></div>` : ''}
    </div>
  `).join('');

  // Projects - load from global projects
  loadStudentProjects();

  // Attendance
  renderStudentAttendance();

  // Assessments
  const assessmentsList = document.getElementById('assessmentsList');
  if (currentStudent.assessments.length === 0) {
    assessmentsList.innerHTML = '<p style="color:#888;text-align:center;">No assessments yet.</p>';
  } else {
    assessmentsList.innerHTML = currentStudent.assessments.map(a => `
      <div class="assessment-view-card">
        <h4>${a.subject}</h4>
        <div class="assessment-view-grid">
          <div class="assessment-view-quarter">
            <span class="quarter-label">1st Quarter</span>
            <p>${a.q1 || 'No remarks yet'}</p>
          </div>
          <div class="assessment-view-quarter">
            <span class="quarter-label">2nd Quarter</span>
            <p>${a.q2 || 'No remarks yet'}</p>
          </div>
          <div class="assessment-view-quarter">
            <span class="quarter-label">3rd Quarter</span>
            <p>${a.q3 || 'No remarks yet'}</p>
          </div>
          <div class="assessment-view-quarter">
            <span class="quarter-label">4th Quarter</span>
            <p>${a.q4 || 'No remarks yet'}</p>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Update notification badge
  updateNotifBadge();

  // Start live date/time
  updateDateTime();
}

function switchDashTab(event, tabId) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

async function loadStudentProjects() {
  const grade = currentStudent.grade || '';
  const res = await fetch(`${API_URL}/projects?grade=${encodeURIComponent(grade)}`);
  if (!res.ok) return;
  const projects = await res.json();
  const projectList = document.getElementById('projectList');
  if (projects.length === 0) {
    projectList.innerHTML = '<p style="color:#888;text-align:center;">No projects yet.</p>';
    return;
  }
  projectList.innerHTML = projects.map(p => `
        <div class="project-card">
            <h4>${p.title}</h4>
            <div class="meta">${p.subject} • Due: ${p.dueDate}</div>
            <p>${p.description}</p>
            <span class="meta">${p.targetGrade === 'all' ? 'All Grades' : p.targetGrade}</span>
        </div>
    `).join('');
}

function confirmLogout() {
  document.getElementById('logoutModal').style.display = 'flex';
}

function closeLogoutModal() {
  document.getElementById('logoutModal').style.display = 'none';
}

function logout() {
  const token = localStorage.getItem('studentToken');
  if (token) {
    fetch(`${API_URL}/student/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => { });
  }
  currentStudent = null;
  localStorage.removeItem('studentToken');
  localStorage.removeItem('studentData');
  if (window._sessionCheckInterval) clearInterval(window._sessionCheckInterval);
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginWrapper').style.display = 'flex';
  document.getElementById('studentId').value = '';
  document.getElementById('studentPassword').value = '';
}

// Check session validity every 30 seconds
function startSessionCheck() {
  window._sessionCheckInterval = setInterval(async () => {
    const token = localStorage.getItem('studentToken');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/student/refresh`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 404) {
        // Try to refresh the token before kicking the user out
        const refreshRes = await fetch(`${API_URL}/student/refresh-token`, { method: 'POST', credentials: 'include' });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          if (data.token) {
            localStorage.setItem('studentToken', data.token);
            return; // Token refreshed successfully, stay logged in
          }
        }
        alert('Your session has ended. Your account may have been logged in on another device or removed.');
        logout();
      }
    } catch (e) { }
  }, 30000);
}


// Toggle activity detail (show/hide image)
function toggleActivityDetail(card) {
  const photoWrapper = card.querySelector('.activity-photo-wrapper');
  if (photoWrapper) {
    photoWrapper.style.display = photoWrapper.style.display === 'none' ? 'block' : 'none';
  }
}

// Open activity image in fullscreen overlay
function openActivityImage(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;justify-content:center;align-items:center;z-index:9999;cursor:pointer;';
  overlay.innerHTML = `<img src="${url}" style="max-width:90%;max-height:90%;border-radius:10px;"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:2rem;cursor:pointer;">✕</span>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}


// Render and filter student payments
function renderStudentPayments() {
  const month = document.getElementById('studentPayMonth') ? document.getElementById('studentPayMonth').value : 'all';
  const year = document.getElementById('studentPayYear') ? document.getElementById('studentPayYear').value : 'all';
  const paymentBody = document.getElementById('paymentTableBody');

  let payments = [...currentStudent.payments];

  // Filter by month
  if (month !== 'all') {
    payments = payments.filter(p => p.date && p.date.substring(5, 7) === month);
  }

  // Filter by year
  if (year !== 'all') {
    payments = payments.filter(p => p.date && p.date.substring(0, 4) === year);
  }

  // Sort newest first
  payments.sort((a, b) => new Date(a.date) - new Date(b.date));

  paymentBody.innerHTML = payments.map(p => {
    const isDiscount = p.amount < 0;
    return `
    <tr${isDiscount ? ' style="background:#e8f5e9;"' : ''}>
      <td>${p.date}</td>
      <td>${p.description}${isDiscount ? ' 🏷️' : ''}</td>
      <td>${isDiscount ? '-₱' + Math.abs(p.amount).toLocaleString() : '₱' + p.amount.toLocaleString()}</td>
      <td><span class="${isDiscount ? 'status-paid' : 'status-' + p.status}">${isDiscount ? '✓ Discount Applied' : (p.status === 'paid' ? '✓ Paid' : '⏳ Pending')}</span></td>
      <td>${p.paidDate ? p.paidDate : '-'}</td>
    </tr>
    `;
  }).join('');

  if (payments.length === 0) {
    paymentBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;padding:2rem;">No payments found</td></tr>';
  }
}

function filterStudentPayments() {
  renderStudentPayments();
}

async function refreshStudentPayments() {
  const token = localStorage.getItem('studentToken');
  if (!token) return;
  try {
    const res = await fetch(`${API_URL}/student/refresh`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.student) {
        currentStudent = data.student;
        localStorage.setItem('studentData', JSON.stringify(data.student));
        // Update summary
        const totalTuition = currentStudent.totalTuition || 0;
        const totalPaid = currentStudent.payments
          .filter(p => p.status === 'paid' && p.amount > 0 && !p.description.startsWith('[Expense]'))
          .reduce((sum, p) => sum + p.amount, 0);
        const balance = totalTuition - totalPaid;
        document.getElementById('totalTuition').textContent = '₱' + totalTuition.toLocaleString();
        document.getElementById('totalPaid').textContent = '₱' + totalPaid.toLocaleString();
        document.getElementById('totalBalance').textContent = '₱' + balance.toLocaleString();
        // Update expenses
        const allExpenses = currentStudent.payments.filter(p => p.description && p.description.startsWith('[Expense]'));
        const totalExpenses = allExpenses.reduce((sum, p) => sum + p.amount, 0);
        const pendingExpenses = allExpenses.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);
        document.getElementById('totalExpenses').textContent = '₱' + totalExpenses.toLocaleString();
        document.getElementById('totalExpensesPending').textContent = pendingExpenses > 0 ? 'Pending: ₱' + pendingExpenses.toLocaleString() : '';
        renderStudentPayments();
      }
    }
  } catch (e) {
    console.error('Refresh error:', e);
  }
}


// Load announcements for student
async function loadStudentAnnouncements() {
  const grade = currentStudent.grade || '';
  const res = await fetch(`${API_URL}/announcements?grade=${encodeURIComponent(grade)}`);
  if (res.ok) {
    const announcements = await res.json();
    const list = document.getElementById('studentAnnouncementsList');

    // Preserve any text the student is currently typing before rebuilding the DOM
    const savedInputs = {};
    list.querySelectorAll('input[id^="student-reply-"]').forEach(input => {
      if (input.value) savedInputs[input.id] = input.value;
    });

    if (announcements.length === 0) {
      list.innerHTML = '<p style="color:#888;text-align:center;">No announcements yet.</p>';
      return;
    }
    list.innerHTML = announcements.map(a => {
      const replies = a.replies || [];
      const hasMore = replies.length > 3;
      const visibleReplies = hasMore ? replies.slice(0, 2) : replies;
      const hiddenReplies = hasMore ? replies.slice(2) : [];
      return `
      <div class="activity-card" style="cursor:default;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4>${a.subject}</h4>
          <span style="background:#ffebee;color:#b71c1c;padding:0.2rem 0.8rem;border-radius:15px;font-size:0.8rem;font-weight:600;">${a.targetGrade === 'all' ? 'All Grades' : a.targetGrade}</span>
        </div>
        <div class="announcement-body announcement-preview" id="student-ann-body-${a._id}" style="margin-top:0.5rem;line-height:1.7;color:#444;">${a.body}</div>
        <button class="btn-see-more" id="btn-student-see-more-${a._id}" onclick="toggleStudentAnnouncementBody('${a._id}')" style="display:none;background:none;border:none;color:#b71c1c;font-weight:600;font-size:0.85rem;cursor:pointer;padding:0.3rem 0;">See More</button>
        <span class="meta">${new Date(a.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <div class="replies-section" style="margin-top:1rem;border-top:1px solid #eee;padding-top:0.8rem;">
          ${visibleReplies.map(r => `
            <div style="margin-bottom:0.6rem;padding:0.5rem 0.8rem;background:${r.role === 'admin' ? '#fff3e0' : '#e8f5e9'};border-radius:8px;">
              <strong style="font-size:0.85rem;">${r.author}</strong> <span style="font-size:0.75rem;color:#888;">${r.role === 'admin' ? '(Admin)' : '(Student)'}</span>
              <p style="margin:0.3rem 0 0;font-size:0.9rem;">${r.message}</p>
              <span style="font-size:0.7rem;color:#aaa;">${new Date(r.createdAt).toLocaleString()}</span>
            </div>
          `).join('')}
          ${hasMore ? `
            <div id="student-replies-hidden-${a._id}" style="display:none;">
              ${hiddenReplies.map(r => `
                <div style="margin-bottom:0.6rem;padding:0.5rem 0.8rem;background:${r.role === 'admin' ? '#fff3e0' : '#e8f5e9'};border-radius:8px;">
                  <strong style="font-size:0.85rem;">${r.author}</strong> <span style="font-size:0.75rem;color:#888;">${r.role === 'admin' ? '(Admin)' : '(Student)'}</span>
                  <p style="margin:0.3rem 0 0;font-size:0.9rem;">${r.message}</p>
                  <span style="font-size:0.7rem;color:#aaa;">${new Date(r.createdAt).toLocaleString()}</span>
                </div>
              `).join('')}
            </div>
            <button id="student-btn-toggle-${a._id}" onclick="toggleStudentReplies('${a._id}', ${hiddenReplies.length})" style="background:none;border:none;color:#b71c1c;font-size:0.85rem;font-weight:600;cursor:pointer;padding:0.4rem 0;margin-top:0.3rem;">
              View ${hiddenReplies.length} more repl${hiddenReplies.length === 1 ? 'y' : 'ies'}
            </button>
          ` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <input type="text" id="student-reply-${a._id}" placeholder="Write a reply..." style="flex:1;padding:0.5rem 0.8rem;border:2px solid #eee;border-radius:8px;font-family:inherit;font-size:0.9rem;" onkeydown="handleStudentReplyKey(event,'${a._id}')">
            <button onclick="studentReply('${a._id}')" style="background:#b71c1c;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:600;cursor:pointer;">Reply</button>
          </div>
        </div>
      </div>
    `}).join('');

    // Ensure announcement bodies render HTML properly (fix for escaped entities)
    list.querySelectorAll('.announcement-body').forEach(el => {
      const text = el.textContent;
      if (text.includes('<') && text.includes('>')) {
        el.innerHTML = text;
      }
    });

    // Apply See More / Collapse for long announcements
    list.querySelectorAll('.announcement-body').forEach(el => {
      const id = el.id.replace('student-ann-body-', '');
      const btn = document.getElementById(`btn-student-see-more-${id}`);
      if (btn && el.scrollHeight > 80) {
        btn.style.display = 'inline-block';
      }
    });

    // Restore any text the student had typed before the DOM was rebuilt
    Object.entries(savedInputs).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = value;
        input.focus();
      }
    });
  }
}

function toggleStudentAnnouncementBody(id) {
  const body = document.getElementById(`student-ann-body-${id}`);
  const btn = document.getElementById(`btn-student-see-more-${id}`);
  if (body.classList.contains('announcement-preview')) {
    body.classList.remove('announcement-preview');
    btn.textContent = 'Collapse';
  } else {
    body.classList.add('announcement-preview');
    btn.textContent = 'See More';
  }
}

function handleStudentReplyKey(e, id) {
  if (e.key === 'Enter') studentReply(id);
}

function toggleStudentReplies(announcementId, hiddenCount) {
  const hidden = document.getElementById(`student-replies-hidden-${announcementId}`);
  const btn = document.getElementById(`student-btn-toggle-${announcementId}`);
  if (hidden.style.display === 'none') {
    hidden.style.display = 'block';
    btn.textContent = 'Show less';
  } else {
    hidden.style.display = 'none';
    btn.textContent = `View ${hiddenCount} more repl${hiddenCount === 1 ? 'y' : 'ies'}`;
  }
}

async function studentReply(announcementId) {
  const input = document.getElementById(`student-reply-${announcementId}`);
  const message = input.value.trim();
  if (!message) return;

  const token = localStorage.getItem('studentToken');
  const res = await fetch(`${API_URL}/announcements/${announcementId}/student-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ message })
  });

  if (res.ok) {
    input.value = '';
    loadStudentAnnouncements();
  } else {
    const data = await res.json();
    showStudentNotification(data.message || 'Error sending reply', true);
  }
}

// Reply notification for students
let lastAdminReplyCount = 0;
let lastAssessmentHash = '';
let lastProjectCount = 0;

function startStudentNotificationCheck() {
  fetchAdminReplyCount().then(count => { lastAdminReplyCount = count; });
  lastAssessmentHash = getAssessmentHash();
  fetchProjectCount().then(count => { lastProjectCount = count; });

  // Check replies and projects every 2 seconds (real-time feel)
  setInterval(async () => {
    const newCount = await fetchAdminReplyCount();
    if (newCount > lastAdminReplyCount) {
      const diff = newCount - lastAdminReplyCount;
      showStudentNotification(`💬 ${diff} new reply${diff > 1 ? 's' : ''} from admin`);
      lastAdminReplyCount = newCount;
      loadStudentAnnouncements();
    }

    // Check for new projects
    const newProjCount = await fetchProjectCount();
    if (newProjCount > lastProjectCount) {
      showStudentNotification('📁 A new project has been posted');
      lastProjectCount = newProjCount;
      loadStudentProjects();
    }
  }, 2000);

  // Check assessment updates every 3 seconds
  let lastNotifCount = (currentStudent.notifications || []).length;

  setInterval(async () => {
    const token = localStorage.getItem('studentToken');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/student/refresh`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.student) {
          let needsDashboardRefresh = false;

          // Check for new notifications
          const newNotifs = (data.student.notifications || []).length;
          if (newNotifs > lastNotifCount) {
            const latest = data.student.notifications[data.student.notifications.length - 1];
            showStudentNotification(latest.message);
            lastNotifCount = newNotifs;
            needsDashboardRefresh = true;
          }

          // Check for assessment changes
          const newHash = JSON.stringify(data.student.assessments);
          if (lastAssessmentHash && newHash !== lastAssessmentHash) {
            showStudentNotification('📝 Your assessments have been updated by the admin');
            needsDashboardRefresh = true;
          }
          lastAssessmentHash = newHash;

          currentStudent = data.student;
          localStorage.setItem('studentData', JSON.stringify(data.student));

          // Only refresh the dashboard UI when something actually changed,
          // to avoid destroying the announcements input field on every tick.
          if (needsDashboardRefresh) {
            populateDashboard();
          }
        }
      }
    } catch (e) { }
  }, 3000);
}

function getAssessmentHash() {
  if (!currentStudent || !currentStudent.assessments) return '';
  return JSON.stringify(currentStudent.assessments);
}

async function fetchAdminReplyCount() {
  try {
    const grade = currentStudent ? currentStudent.grade : '';
    const res = await fetch(`${API_URL}/announcements?grade=${encodeURIComponent(grade)}`);
    if (!res.ok) return lastAdminReplyCount;
    const announcements = await res.json();
    let total = 0;
    announcements.forEach(a => {
      total += (a.replies || []).filter(r => r.role === 'admin').length;
    });
    return total;
  } catch (e) {
    return lastAdminReplyCount;
  }
}

async function fetchProjectCount() {
  try {
    const grade = currentStudent ? currentStudent.grade : '';
    const res = await fetch(`${API_URL}/projects?grade=${encodeURIComponent(grade)}`);
    if (!res.ok) return lastProjectCount;
    const projects = await res.json();
    return projects.length;
  } catch (e) {
    return lastProjectCount;
  }
}

function showStudentNotification(message, isError) {
  const existing = document.querySelector('.student-notification');
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.className = 'student-notification' + (isError ? ' student-notification-error' : '');
  notif.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">✕</button>
    `;
  document.body.appendChild(notif);
  setTimeout(() => { if (notif.parentElement) notif.remove(); }, 8000);
}



// Student Profile Photo Upload
async function uploadStudentPhoto(input) {
  if (!input.files || !input.files[0]) return;

  const token = localStorage.getItem('studentToken');
  if (!token) return;

  const formData = new FormData();
  formData.append('profileImage', input.files[0]);

  try {
    const res = await fetch(`${API_URL}/student/profile-photo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      currentStudent.profileImage = data.profileImage;
      localStorage.setItem('studentData', JSON.stringify(currentStudent));

      // Update avatar display
      const avatarEl = document.querySelector('.info-avatar');
      avatarEl.innerHTML = `<img src="${imgUrl(data.profileImage)}" style="width:110px;height:110px;border-radius:50%;object-fit:cover;">
      <label class="avatar-upload-btn" title="Change photo">
        📷
        <input type="file" id="studentPhotoUpload" accept="image/*" onchange="uploadStudentPhoto(this)" style="display:none;">
      </label>`;

      showStudentNotification('Profile photo updated!');
    } else {
      const data = await res.json();
      showStudentNotification(data.message || 'Error uploading photo', true);
    }
  } catch (err) {
    showStudentNotification('Error uploading photo', true);
  }
}


// ============================================
// FEATURE: Notification Center (Bell Icon)
// ============================================
function toggleNotifCenter() {
  const center = document.getElementById('notifCenter');
  center.style.display = center.style.display === 'none' ? 'block' : 'none';
  if (center.style.display === 'block') renderNotifCenter();
}

function renderNotifCenter() {
  const list = document.getElementById('notifCenterList');
  const notifs = currentStudent.notifications || [];
  if (notifs.length === 0) {
    list.innerHTML = '<p class="notif-empty">No notifications yet</p>';
    return;
  }
  list.innerHTML = notifs.slice().reverse().slice(0, 20).map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}">
            <span class="notif-dot"></span>
            <div>
                <p>${n.message}</p>
                <span class="notif-time">${new Date(n.createdAt).toLocaleString()}</span>
            </div>
        </div>
    `).join('');
}

function updateNotifBadge() {
  const notifs = currentStudent.notifications || [];
  const unread = notifs.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  if (unread > 0) {
    badge.style.display = 'flex';
    badge.textContent = unread > 9 ? '9+' : unread;
  } else {
    badge.style.display = 'none';
  }
}

async function markAllRead() {
  const token = localStorage.getItem('studentToken');
  await fetch(`${API_URL}/student/notifications/read`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (currentStudent.notifications) {
    currentStudent.notifications.forEach(n => n.read = true);
  }
  updateNotifBadge();
  renderNotifCenter();
}




// ============================================
// ATTENDANCE - Student View
// ============================================

function renderStudentAttendance() {
  const month = document.getElementById('attendMonth') ? document.getElementById('attendMonth').value : 'all';
  const year = document.getElementById('attendYear') ? document.getElementById('attendYear').value : 'all';
  const tbody = document.getElementById('attendanceTableBody');

  let records = [...(currentStudent.attendance || [])];

  // Filter by month
  if (month !== 'all') {
    records = records.filter(a => a.date && a.date.substring(5, 7) === month);
  }

  // Filter by year
  if (year !== 'all') {
    records = records.filter(a => a.date && a.date.substring(0, 4) === year);
  }

  // Sort by date (newest first)
  records.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Update summary
  const total = records.length;
  const present = records.filter(r => r.status === 'P').length;
  const late = records.filter(r => r.status === 'L').length;
  const absent = records.filter(r => r.status === 'U' || r.status === 'E').length;

  document.getElementById('attendTotalDays').textContent = total;
  document.getElementById('attendPresent').textContent = present;
  document.getElementById('attendLate').textContent = late;
  document.getElementById('attendAbsent').textContent = absent;

  const statusLabels = { P: '✓ Present', L: '⏰ Late', E: '📋 Excused', U: '✗ Absent' };
  const statusClasses = { P: 'paid', L: 'status-late', E: 'status-excused', U: 'pending' };
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  tbody.innerHTML = records.map(r => {
    const dayName = days[new Date(r.date).getDay()];
    return `
            <tr>
                <td>${r.date}</td>
                <td>${dayName}</td>
                <td><span class="status-${r.status === 'P' ? 'paid' : r.status === 'U' ? 'pending' : r.status === 'L' ? 'paid' : 'paid'}" style="${r.status === 'L' ? 'background:#fff3e0;color:#e65100;' : r.status === 'E' ? 'background:#e3f2fd;color:#1565c0;' : ''}">${statusLabels[r.status] || r.status}</span></td>
            </tr>
        `;
  }).join('');

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#888;padding:2rem;">No attendance records found</td></tr>';
  }
}


// ============================================
// FIRST LOGIN - FORCE PASSWORD CHANGE
// ============================================

function cancelPasswordChange() {
  // Clear form fields and errors
  document.getElementById('newPw').value = '';
  document.getElementById('confirmPw').value = '';
  document.getElementById('changePwError').textContent = '';

  // Log out the student session
  const token = localStorage.getItem('studentToken');
  if (token) {
    fetch(`${API_URL}/student/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => { });
  }
  currentStudent = null;
  localStorage.removeItem('studentToken');
  localStorage.removeItem('studentData');

  // Hide change password overlay and show login
  document.getElementById('changePwOverlay').style.display = 'none';
  document.getElementById('loginWrapper').style.display = 'flex';
  document.getElementById('studentId').value = '';
  document.getElementById('studentPassword').value = '';
}

async function handleFirstPasswordChange(event) {
  event.preventDefault();
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;
  const errorEl = document.getElementById('changePwError');

  if (newPw !== confirmPw) {
    errorEl.textContent = 'Passwords do not match';
    return;
  }

  if (newPw.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    return;
  }

  if (newPw === 'student123') {
    errorEl.textContent = 'Please choose a different password than the default';
    return;
  }

  const token = localStorage.getItem('studentToken');
  try {
    const res = await fetch(`${API_URL}/student/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword: newPw })
    });

    const data = await res.json();

    if (res.ok) {
      currentStudent.mustChangePassword = false;
      localStorage.setItem('studentData', JSON.stringify(currentStudent));
      document.getElementById('changePwOverlay').style.display = 'none';
      showDashboard();
      startSessionCheck();
      startStudentNotificationCheck();
    } else {
      errorEl.textContent = data.message || 'Error changing password';
    }
  } catch (err) {
    errorEl.textContent = 'Cannot connect to server';
  }
}

// ============================================
// LIVE DATE, TIME & GREETING
// ============================================
function updateDateTime() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good Evening';
  if (hour < 12) greeting = 'Good Morning';
  else if (hour < 18) greeting = 'Good Afternoon';

  const name = currentStudent ? currentStudent.fullName.split(' ')[0] : '';
  const greetingEl = document.getElementById('greetingText');
  const dateEl = document.getElementById('datetimeText');
  const timeEl = document.getElementById('timeText');

  if (greetingEl) greetingEl.textContent = `${greeting}, ${name}!`;
  if (dateEl) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('en-US', options);
  }
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

setInterval(updateDateTime, 1000);

// ============================================
// DARK MODE TOGGLE
// ============================================
function toggleDarkMode() {
  const toggle = document.getElementById('themeToggle');
  if (toggle.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('studentTheme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('studentTheme', 'light');
  }
}

// Load saved theme on page load
(function loadSavedTheme() {
  const saved = localStorage.getItem('studentTheme');
  if (saved === 'dark') {
    document.body.classList.add('dark-mode');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.checked = true;
  }
})();
