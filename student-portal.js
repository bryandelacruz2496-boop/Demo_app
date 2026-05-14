const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://beata-backend.onrender.com/api';
let currentStudent = null;

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
    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    populateDashboard();
    startSessionCheck();
    startStudentNotificationCheck();

    // Then try to refresh in background
    fetch(`${API_URL}/student/refresh`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => {
      if (res.status === 401) {
        // Session expired - logged in on another device
        alert('Your session has ended because your account was logged in on another device.');
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
      showDashboard();
      startSessionCheck();
      startStudentNotificationCheck();
    } else {
      errorEl.textContent = data.message;
    }
  } catch (err) {
    errorEl.textContent = 'Cannot connect to server. Please try again.';
  }
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
    avatarEl.innerHTML = `<img src="http://localhost:5000${currentStudent.profileImage}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">
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

  renderStudentPayments();
  try { loadStudentAnnouncements(); } catch (e) { }

  // Activities
  const activityList = document.getElementById('activityList');
  activityList.innerHTML = currentStudent.activities.map(a => `
    <div class="activity-card" onclick="toggleActivityDetail(this)">
      <h4>${a.title}</h4>
      <div class="meta">${a.subject} • ${a.date}</div>
      <p>${a.description}</p>
      ${a.imageUrl ? `<div class="activity-photo-wrapper" style="display:none;"><img src="http://localhost:5000${a.imageUrl}" class="activity-photo" onclick="event.stopPropagation(); openActivityImage('http://localhost:5000${a.imageUrl}')"><p class="photo-hint">Click image to enlarge</p></div>` : ''}
    </div>
  `).join('');

  // Projects
  const projectList = document.getElementById('projectList');
  projectList.innerHTML = currentStudent.projects.map(p => `
    <div class="project-card">
      <h4>${p.title} ${p.grade ? '<span class="grade-badge">' + p.grade + '</span>' : '<span class="grade-badge" style="background:#ff9800">Pending</span>'}</h4>
      <div class="meta">${p.subject} • Due: ${p.dueDate}</div>
      <p>${p.description}</p>
    </div>
  `).join('');

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

  // Calendar events
  loadCalendarEvents();
}

function switchDashTab(event, tabId) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
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
      if (res.status === 401) {
        alert('Your session has ended because your account was logged in on another device.');
        logout();
      }
    } catch (e) { }
  }, 2000);
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

  paymentBody.innerHTML = payments.map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${p.description}</td>
      <td>₱${p.amount.toLocaleString()}</td>
      <td><span class="status-${p.status}">${p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
    </tr>
  `).join('');

  if (payments.length === 0) {
    paymentBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:2rem;">No payments found</td></tr>';
  }
}

function filterStudentPayments() {
  renderStudentPayments();
}


// Load announcements for student
async function loadStudentAnnouncements() {
  const grade = currentStudent.grade || '';
  const res = await fetch(`${API_URL}/announcements?grade=${encodeURIComponent(grade)}`);
  if (res.ok) {
    const announcements = await res.json();
    const list = document.getElementById('studentAnnouncementsList');
    if (announcements.length === 0) {
      list.innerHTML = '<p style="color:#888;text-align:center;">No announcements yet.</p>';
      return;
    }
    list.innerHTML = announcements.map(a => `
      <div class="activity-card" style="cursor:default;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4>${a.subject}</h4>
          <span style="background:#ffebee;color:#b71c1c;padding:0.2rem 0.8rem;border-radius:15px;font-size:0.8rem;font-weight:600;">${a.targetGrade === 'all' ? 'All Grades' : a.targetGrade}</span>
        </div>
        <p style="margin-top:0.5rem;">${a.body}</p>
        <span class="meta">${new Date(a.createdAt).toLocaleDateString()}</span>
        <div class="replies-section" style="margin-top:1rem;border-top:1px solid #eee;padding-top:0.8rem;">
          ${(a.replies || []).map(r => `
            <div style="margin-bottom:0.6rem;padding:0.5rem 0.8rem;background:${r.role === 'admin' ? '#fff3e0' : '#e8f5e9'};border-radius:8px;">
              <strong style="font-size:0.85rem;">${r.author}</strong> <span style="font-size:0.75rem;color:#888;">${r.role === 'admin' ? '(Admin)' : '(Student)'}</span>
              <p style="margin:0.3rem 0 0;font-size:0.9rem;">${r.message}</p>
              <span style="font-size:0.7rem;color:#aaa;">${new Date(r.createdAt).toLocaleString()}</span>
            </div>
          `).join('')}
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <input type="text" id="student-reply-${a._id}" placeholder="Write a reply..." style="flex:1;padding:0.5rem 0.8rem;border:2px solid #eee;border-radius:8px;font-family:inherit;font-size:0.9rem;" onkeydown="handleStudentReplyKey(event,'${a._id}')">
            <button onclick="studentReply('${a._id}')" style="background:#b71c1c;color:#fff;border:none;padding:0.5rem 1rem;border-radius:8px;font-weight:600;cursor:pointer;">Reply</button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function handleStudentReplyKey(e, id) {
  if (e.key === 'Enter') studentReply(id);
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

function startStudentNotificationCheck() {
  fetchAdminReplyCount().then(count => { lastAdminReplyCount = count; });
  lastAssessmentHash = getAssessmentHash();

  // Check replies every 2 seconds (real-time feel)
  setInterval(async () => {
    const newCount = await fetchAdminReplyCount();
    if (newCount > lastAdminReplyCount) {
      const diff = newCount - lastAdminReplyCount;
      showStudentNotification(`💬 ${diff} new reply${diff > 1 ? 's' : ''} from admin`);
      lastAdminReplyCount = newCount;
      loadStudentAnnouncements();
    }
  }, 2000);

  // Check assessment updates every 3 seconds
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
          const newHash = JSON.stringify(data.student.assessments);
          if (lastAssessmentHash && newHash !== lastAssessmentHash) {
            showStudentNotification('📝 Your assessments have been updated by the admin');
            currentStudent = data.student;
            localStorage.setItem('studentData', JSON.stringify(data.student));
            populateDashboard();
          }
          lastAssessmentHash = newHash;
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

// Calendar Events
async function loadCalendarEvents() {
  try {
    const res = await fetch(`${API_URL}/events`);
    if (!res.ok) return;
    const events = await res.json();
    const list = document.getElementById('calendarEventsList');

    if (!list) return;

    if (events.length === 0) {
      list.innerHTML = '<p style="color:#888;text-align:center;">No upcoming events.</p>';
      return;
    }

    const typeColors = { Exam: '#b71c1c', Holiday: '#2e7d32', 'Field Trip': '#1565c0', Event: '#e65100', Meeting: '#6a1b9a' };

    list.innerHTML = events.map(e => `
      <div class="activity-card" style="cursor:default;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <h4>${e.title}</h4>
          <span class="event-type-badge" style="background:${typeColors[e.type] || '#b71c1c'}20;color:${typeColors[e.type] || '#b71c1c'};padding:0.2rem 0.8rem;border-radius:15px;font-size:0.8rem;font-weight:600;">${e.type}</span>
        </div>
        <div class="meta">📅 ${e.date}</div>
        ${e.description ? `<p style="margin-top:0.5rem;">${e.description}</p>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading calendar events:', err);
  }
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
      avatarEl.innerHTML = `<img src="http://localhost:5000${data.profileImage}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">
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
