const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : 'https://beata-backend.onrender.com/api';
let adminToken = localStorage.getItem('adminToken');
let students = [];
let selectedStudent = null;
let lastReplyCount = 0;

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        document.getElementById('loginWrapper').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        document.getElementById('adminName').textContent = localStorage.getItem('adminName') || 'Admin';
        loadStudents();
        startReplyNotificationCheck();
    }
});

// Login
async function handleAdminLogin(event) {
    event.preventDefault();
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            adminToken = data.token;
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminName', data.admin.name);
            document.getElementById('adminName').textContent = data.admin.name;
            document.getElementById('loginWrapper').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            loadStudents();
            startReplyNotificationCheck();
        } else {
            errorEl.textContent = data.message;
        }
    } catch (err) {
        errorEl.textContent = 'Cannot connect to server';
    }
}

// Load students
async function loadStudents() {
    const res = await fetch(`${API_URL}/admin/students`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    students = await res.json();
    renderStudentList();
    calculateCollection();
    loadAnnouncements();
}

// Announcements
async function loadAnnouncements() {
    const res = await fetch(`${API_URL}/announcements`);
    const announcements = await res.json();
    const list = document.getElementById('announcementsList');

    if (announcements.length === 0) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = `
        <h3 style="color:#b71c1c;margin-bottom:1rem;">📢 Recent Announcements</h3>
        ${announcements.slice(0, 5).map(a => `
            <div class="announcement-card">
                <div class="announcement-header">
                    <h4>${a.subject}</h4>
                    <div>
                        <span class="announcement-badge">${a.targetGrade === 'all' ? 'All Grades' : a.targetGrade}</span>
                        <button class="btn-remove-subject" onclick="deleteAnnouncement('${a._id}')">🗑️</button>
                    </div>
                </div>
                <p>${a.body}</p>
                <span class="announcement-date">${new Date(a.createdAt).toLocaleDateString()}</span>
                <div class="replies-section">
                    ${(a.replies || []).map(r => `
                        <div class="reply-item reply-${r.role}">
                            <strong>${r.author}</strong> <span class="reply-role">${r.role}</span>
                            <p>${r.message}</p>
                            <span class="reply-date">${new Date(r.createdAt).toLocaleString()}</span>
                        </div>
                    `).join('')}
                    <div class="reply-form">
                        <input type="text" id="reply-${a._id}" placeholder="Write a reply..." class="reply-input" onkeydown="handleAdminReplyKey(event,'${a._id}')">
                        <button class="btn-reply" onclick="adminReply('${a._id}')">Reply</button>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

function showAnnouncementForm() {
    const form = document.getElementById('announcementForm');
    if (form.style.display === 'block') {
        form.style.display = 'none';
        return;
    }
    form.style.display = 'block';
    document.getElementById('addStudentForm').style.display = 'none';
    document.getElementById('inquiriesPanel').style.display = 'none';
}

function hideAnnouncementForm() {
    document.getElementById('announcementForm').style.display = 'none';
}

async function createAnnouncement() {
    const subject = document.getElementById('annSubject').value;
    const body = document.getElementById('annBody').value;
    const targetGrade = document.getElementById('annGrade').value;

    if (!subject || !body) {
        showToast('Please fill in subject and body');
        return;
    }

    showConfirmPopup('Are you sure you want to post this announcement?', async () => {
        const res = await fetch(`${API_URL}/announcements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ subject, body, targetGrade })
        });

        if (res.ok) {
            showToast('Announcement posted!');
            document.getElementById('annSubject').value = '';
            document.getElementById('annBody').value = '';
            document.getElementById('annGrade').value = 'all';
            hideAnnouncementForm();
            loadAnnouncements();
        }
    });
}

async function deleteAnnouncement(id) {
    const res = await fetch(`${API_URL}/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
        showToast('Announcement deleted');
        loadAnnouncements();
    }
}

function handleAdminReplyKey(e, id) {
    if (e.key === 'Enter') adminReply(id);
}

async function adminReply(announcementId) {
    const input = document.getElementById(`reply-${announcementId}`);
    const message = input.value.trim();
    if (!message) return;

    const res = await fetch(`${API_URL}/announcements/${announcementId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ message })
    });

    if (res.ok) {
        input.value = '';
        showToast('Reply posted!');
        loadAnnouncements();
    }
}

function calculateCollection() {
    const month = document.getElementById('collectionMonth').value;
    const year = document.getElementById('collectionYear').value;

    let collected = 0;
    let pending = 0;

    students.forEach(student => {
        student.payments.forEach(payment => {
            if (payment.status === 'paid' && payment.paidDate && payment.paidDate.startsWith(`${year}-${month}`)) {
                collected += payment.amount;
            }
            if (payment.status === 'pending' && payment.date && payment.date.startsWith(`${year}-${month}`)) {
                pending += payment.amount;
            }
        });
    });

    document.getElementById('monthCollected').textContent = '₱' + collected.toLocaleString();
    document.getElementById('monthPending').textContent = '₱' + pending.toLocaleString();
    document.getElementById('monthTotal').textContent = '₱' + (collected + pending).toLocaleString();
}

function renderStudentList() {
    const filterGrade = document.getElementById('filterGrade') ? document.getElementById('filterGrade').value : 'all';
    const list = document.getElementById('studentList');

    let filtered = [...students];
    if (filterGrade !== 'all') {
        filtered = filtered.filter(s => s.grade && s.grade.toLowerCase().includes(filterGrade.toLowerCase()));
    }

    list.innerHTML = filtered.map(s => `
    <div class="student-item" onclick="selectStudent('${s._id}')">
      <div class="student-item-info">
        <h4>${s.fullName}</h4>
        <p>${s.studentNo} • ${s.grade}</p>
      </div>
      <span class="student-item-badge">${s.grade ? s.grade.split(' - ')[0] : ''}</span>
    </div>
  `).join('');

    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No students found</p>';
    }
}

// Select student
async function selectStudent(id) {
    const res = await fetch(`${API_URL}/admin/students/${id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    selectedStudent = await res.json();

    document.getElementById('studentListPanel').style.display = 'none';
    document.getElementById('studentDetailPanel').style.display = 'block';

    document.getElementById('studentHeader').innerHTML = `
    <h2>${selectedStudent.fullName}</h2>
    <p>${selectedStudent.studentNo} • ${selectedStudent.grade} • Guardian: ${selectedStudent.guardian}</p>
  `;

    renderProfile();
    renderGrades();
    renderPayments();
    renderActivities();
    renderProjects();
}

// Profile
let profileEditMode = false;

function renderProfile() {
    // Photo
    const photoWrapper = document.getElementById('profilePhotoWrapper');
    if (selectedStudent.profileImage) {
        photoWrapper.innerHTML = `<img src="http://localhost:5000${selectedStudent.profileImage}" class="profile-img">`;
    } else {
        photoWrapper.innerHTML = `<span class="no-photo">No Photo</span>`;
    }

    // Fill form fields
    document.getElementById('editFullName').value = selectedStudent.fullName || '';
    document.getElementById('editGrade').value = selectedStudent.grade || '';
    document.getElementById('editGuardian').value = selectedStudent.guardian || '';
    document.getElementById('editGuardianContact').value = selectedStudent.guardianContact || '';
    document.getElementById('editAddress').value = selectedStudent.address || '';
    setDatePickerValue('editBirthDate', selectedStudent.birthDate || '');
    document.getElementById('editGender').value = selectedStudent.gender || '';
    document.getElementById('editTuition').value = selectedStudent.totalTuition || '';
    document.getElementById('editPayOption').value = selectedStudent.paymentOption || 'monthly';

    // Set read-only by default
    setProfileEditable(false);
}

function setProfileEditable(editable) {
    profileEditMode = editable;
    const inputs = document.querySelectorAll('#profilePanel input, #profilePanel select');
    inputs.forEach(input => {
        if (input.type === 'file') return;
        input.disabled = !editable;
    });

    document.getElementById('btnEditProfile').style.display = editable ? 'none' : 'inline-block';
    document.getElementById('btnSaveProfile').style.display = editable ? 'inline-block' : 'none';
    document.getElementById('btnCancelProfile').style.display = editable ? 'inline-block' : 'none';
    document.getElementById('editProfilePhotoLabel').style.display = editable ? 'inline-flex' : 'none';
}

function enableProfileEdit() {
    setProfileEditable(true);
}

function cancelProfileEdit() {
    renderProfile();
}

async function changeStudentPassword() {
    const password = document.getElementById('newStudentPassword').value;
    if (!password || password.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
    }

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ password })
    });

    if (res.ok) {
        document.getElementById('newStudentPassword').value = '';
        showToast('Password updated successfully!');
    } else {
        const data = await res.json();
        showToast(data.message || 'Error updating password');
    }
}

async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('profileImage', input.files[0]);

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        const data = await res.json();
        selectedStudent = data.student;
        renderProfile();
        showToast('Photo updated!');
    }
}

async function saveProfile() {
    const formData = new FormData();
    formData.append('fullName', document.getElementById('editFullName').value);
    formData.append('grade', document.getElementById('editGrade').value);
    formData.append('guardian', document.getElementById('editGuardian').value);
    formData.append('guardianContact', document.getElementById('editGuardianContact').value);
    formData.append('address', document.getElementById('editAddress').value);
    formData.append('birthDate', getDatePickerValue('editBirthDate'));
    formData.append('gender', document.getElementById('editGender').value);
    formData.append('totalTuition', document.getElementById('editTuition').value);
    formData.append('paymentOption', document.getElementById('editPayOption').value);

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        const data = await res.json();
        selectedStudent = data.student;
        document.getElementById('studentHeader').innerHTML = `
      <h2>${selectedStudent.fullName}</h2>
      <p>${selectedStudent.studentNo} • ${selectedStudent.grade} • Guardian: ${selectedStudent.guardian}</p>
    `;
        showToast('Profile saved!');
    }
}

function backToList() {
    document.getElementById('studentDetailPanel').style.display = 'none';
    document.getElementById('studentListPanel').style.display = 'block';
    loadStudents();
}

// Grades
function renderGrades() {
    const form = document.getElementById('gradesForm');
    form.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Subject</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th></th></tr></thead>
      <tbody>
        ${selectedStudent.assessments.map((a, i) => `
          <tr>
            <td><strong>${a.subject}</strong></td>
            <td><input class="grade-input" id="q1_${i}" type="number" min="0" max="100" value="${a.q1 || ''}"></td>
            <td><input class="grade-input" id="q2_${i}" type="number" min="0" max="100" value="${a.q2 || ''}"></td>
            <td><input class="grade-input" id="q3_${i}" type="number" min="0" max="100" value="${a.q3 || ''}"></td>
            <td><input class="grade-input" id="q4_${i}" type="number" min="0" max="100" value="${a.q4 || ''}"></td>
            <td><button class="btn-remove-subject" onclick="removeSubject(${i})">✕</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="add-subject-row">
      <select id="newSubjectName">
        <option value="">Select Subject</option>
        <option value="Mathematics">Mathematics</option>
        <option value="Science">Science</option>
        <option value="English">English</option>
        <option value="Filipino">Filipino</option>
        <option value="Araling Panlipunan">Araling Panlipunan</option>
        <option value="MAPEH">MAPEH</option>
        <option value="TLE">TLE</option>
        <option value="Values Education">Values Education</option>
        <option value="Mother Tongue">Mother Tongue</option>
        <option value="ESP">ESP</option>
      </select>
      <button class="btn-add" onclick="addSubject()">+ Add Subject</button>
    </div>
  `;
}

function addSubject() {
    const name = document.getElementById('newSubjectName').value.trim();
    if (!name) return;
    selectedStudent.assessments.push({ subject: name, q1: null, q2: null, q3: null, q4: null });
    renderGrades();
}

function removeSubject(index) {
    selectedStudent.assessments.splice(index, 1);
    renderGrades();
}

async function saveGrades() {
    const assessments = selectedStudent.assessments.map((a, i) => ({
        subject: a.subject,
        q1: document.getElementById(`q1_${i}`).value ? Number(document.getElementById(`q1_${i}`).value) : null,
        q2: document.getElementById(`q2_${i}`).value ? Number(document.getElementById(`q2_${i}`).value) : null,
        q3: document.getElementById(`q3_${i}`).value ? Number(document.getElementById(`q3_${i}`).value) : null,
        q4: document.getElementById(`q4_${i}`).value ? Number(document.getElementById(`q4_${i}`).value) : null
    }));

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/assessments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ assessments })
    });

    if (res.ok) {
        showToast('Grades saved successfully!');
        const data = await res.json();
        selectedStudent.assessments = data.assessments;
        renderGrades();
    }
}

// Payments
function renderPayments() {
    const month = document.getElementById('adminPayMonth') ? document.getElementById('adminPayMonth').value : 'all';
    const year = document.getElementById('adminPayYear') ? document.getElementById('adminPayYear').value : 'all';
    const body = document.getElementById('paymentsBody');

    let payments = [...selectedStudent.payments];

    // Filter by month
    if (month !== 'all') {
        payments = payments.filter(p => p.date && p.date.substring(5, 7) === month);
    }

    // Filter by year
    if (year !== 'all') {
        payments = payments.filter(p => p.date && p.date.substring(0, 4) === year);
    }

    // Sort by date
    payments.sort((a, b) => new Date(a.date) - new Date(b.date));

    body.innerHTML = payments.map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${p.description}</td>
      <td>₱${p.amount.toLocaleString()}</td>
      <td><span class="status-${p.status}">${p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
      <td>${p.paidDate || '-'}</td>
      <td>
        ${p.status === 'pending'
            ? `<button class="btn-status btn-mark-paid" onclick="updatePaymentStatus('${p._id}', 'paid')">Mark Paid</button>`
            : `<button class="btn-status btn-mark-pending" onclick="updatePaymentStatus('${p._id}', 'pending')">Mark Pending</button>`
        }
      </td>
    </tr>
  `).join('');

    if (payments.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:2rem;">No payments found</td></tr>';
    }
}

async function addPayment() {
    const date = getDatePickerValue('payDate');
    const description = document.getElementById('payDesc').value;
    const amount = Number(document.getElementById('payAmount').value);
    const status = document.getElementById('payStatus').value;

    if (!date || !description || !amount) return;

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ date, description, amount, status })
    });

    if (res.ok) {
        const data = await res.json();
        selectedStudent.payments = data.payments;
        renderPayments();
        showToast('Payment added!');
        document.getElementById('payDate').value = '';
        document.getElementById('payDate').dataset.value = '';
        document.getElementById('payDesc').value = '';
        document.getElementById('payAmount').value = '';
    }
}

async function updatePaymentStatus(paymentId, status) {
    const msg = status === 'paid' ? 'Are you sure you want to mark this payment as paid?' : 'Are you sure you want to mark this payment as pending?';
    showConfirmPopup(msg, async () => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/payments/${paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ status })
        });

        if (res.ok) {
            const data = await res.json();
            selectedStudent.payments = data.payments;
            renderPayments();
            showToast('Payment status updated!');
        }
    });
}

// Activities
function renderActivities() {
    const list = document.getElementById('activitiesList');
    list.innerHTML = selectedStudent.activities.map(a => `
    <div class="activity-item">
      <div class="item-header">
        <h4>${a.title}</h4>
        <button class="btn-delete" onclick="deleteActivity('${a._id}')">🗑️</button>
      </div>
      <div class="meta">${a.subject} • ${a.date}</div>
      <p>${a.description}</p>
      ${a.imageUrl ? `<img src="http://localhost:5000${a.imageUrl}" class="activity-image" onclick="viewImage('http://localhost:5000${a.imageUrl}')">` : ''}
    </div>
  `).join('');
}

async function deleteActivity(activityId) {
    if (!confirm('Delete this activity?')) return;
    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/activities/${activityId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
        const data = await res.json();
        selectedStudent.activities = data.activities;
        renderActivities();
        showToast('Activity deleted');
    }
}

function previewImage(input) {
    const preview = document.getElementById('actImagePreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function viewImage(url) {
    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';
    overlay.innerHTML = `<img src="${url}"><span class="close-overlay" onclick="this.parentElement.remove()">✕</span>`;
    document.body.appendChild(overlay);
}

async function addActivity() {
    const title = document.getElementById('actTitle').value;
    const subject = document.getElementById('actSubject').value;
    const date = getDatePickerValue('actDate');
    const description = document.getElementById('actDesc').value;
    const imageFile = document.getElementById('actImage').files[0];

    if (!title || !subject || !date || !description) return;

    showConfirmPopup('Are you sure you want to add this activity?', async () => {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('date', date);
        formData.append('description', description);
        if (imageFile) formData.append('image', imageFile);

        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/activities`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            selectedStudent.activities = data.activities;
            renderActivities();
            showToast('Activity added!');
            document.getElementById('actTitle').value = '';
            document.getElementById('actSubject').value = '';
            document.getElementById('actDate').value = '';
            document.getElementById('actDate').dataset.value = '';
            document.getElementById('actDesc').value = '';
            document.getElementById('actImage').value = '';
            document.getElementById('actImagePreview').style.display = 'none';
        }
    });
}

// Projects
function renderProjects() {
    const list = document.getElementById('projectsList');
    list.innerHTML = selectedStudent.projects.map(p => `
    <div class="project-item">
      <div class="item-header">
        <h4>${p.title} ${p.grade ? '(' + p.grade + ')' : '(No grade yet)'}</h4>
        <button class="btn-delete" onclick="deleteProject('${p._id}')">🗑️</button>
      </div>
      <div class="meta">${p.subject} • Due: ${p.dueDate}</div>
      <p>${p.description}</p>
    </div>
  `).join('');
}

async function deleteProject(projectId) {
    if (!confirm('Delete this project?')) return;
    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (res.ok) {
        const data = await res.json();
        selectedStudent.projects = data.projects;
        renderProjects();
        showToast('Project deleted');
    }
}

async function addProject() {
    const title = document.getElementById('projTitle').value;
    const subject = document.getElementById('projSubject').value;
    const dueDate = getDatePickerValue('projDue');
    const description = document.getElementById('projDesc').value;
    const grade = document.getElementById('projGrade').value || null;

    if (!title || !subject || !dueDate || !description) return;

    showConfirmPopup('Are you sure you want to add this project?', async () => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ title, subject, dueDate, description, grade })
        });

        if (res.ok) {
            const data = await res.json();
            selectedStudent.projects = data.projects;
            renderProjects();
            showToast('Project added!');
            document.getElementById('projTitle').value = '';
            document.getElementById('projSubject').value = '';
            document.getElementById('projDue').value = '';
            document.getElementById('projDue').dataset.value = '';
            document.getElementById('projDesc').value = '';
            document.getElementById('projGrade').value = '';
        }
    });
}

// Tab switching
function switchAdminTab(event, tabId) {
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
}

// Toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Add Student
function showAddStudentForm() {
    const form = document.getElementById('addStudentForm');
    if (form.style.display === 'block') {
        form.style.display = 'none';
        return;
    }
    form.style.display = 'block';
    document.getElementById('announcementForm').style.display = 'none';
    document.getElementById('inquiriesPanel').style.display = 'none';
    document.getElementById('newStudentResult').style.display = 'none';
}

// Tuition Display
const TUITION_DATA = {
    old: {
        'Palaruan 1': { tuition: 13000, misc: 6000, total: 19000 },
        'Palaruan 2': { tuition: 13000, misc: 6000, total: 19000 },
        'Kindergarten': { tuition: 13000, misc: 7000, total: 20000 },
        'Grade 1': { tuition: 16500, misc: 6000, total: 22500 },
        'Grade 2': { tuition: 16500, misc: 6000, total: 22500 },
        'Grade 3': { tuition: 16500, misc: 6000, total: 22500 },
        'Grade 4': { tuition: 16500, misc: 6000, total: 22500 },
        'Grade 5': { tuition: 16500, misc: 6000, total: 22500 },
        'Grade 6': { tuition: 16000, misc: 7500, total: 23500 }
    },
    new: {
        'Palaruan 1': { tuition: 15000, misc: 6000, total: 21000 },
        'Palaruan 2': { tuition: 15000, misc: 6000, total: 21000 },
        'Kindergarten': { tuition: 16000, misc: 7000, total: 23000 },
        'Grade 1': { tuition: 18000, misc: 6500, total: 24500 },
        'Grade 2': { tuition: 18000, misc: 6500, total: 24500 },
        'Grade 3': { tuition: 18000, misc: 6500, total: 24500 },
        'Grade 4': { tuition: 18000, misc: 6500, total: 24500 },
        'Grade 5': { tuition: 18000, misc: 6500, total: 24500 },
        'Grade 6': { tuition: 20000, misc: 7500, total: 27500 }
    }
};

const MONTHLY_AMOUNTS = {
    old: {
        'Palaruan 1': [3000, 2818, 2818, 2818, 2818, 2818, 2818],
        'Palaruan 2': [3000, 2818, 2818, 2818, 2818, 2818, 2818],
        'Kindergarten': [3000, 2985, 2985, 2985, 2985, 2985, 2985],
        'Grade 1': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 2': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 3': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 4': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 5': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 6': [3000, 3603, 3603, 3603, 3603, 3603, 3603]
    },
    new: {
        'Palaruan 1': [3000, 3175, 3175, 3175, 3175, 3175, 3175],
        'Palaruan 2': [3000, 3175, 3175, 3175, 3175, 3175, 3175],
        'Kindergarten': [3000, 3520, 3520, 3520, 3520, 3520, 3520],
        'Grade 1': [3000, 3793, 3793, 3793, 3793, 3793, 3793],
        'Grade 2': [3000, 3793, 3793, 3793, 3793, 3793, 3793],
        'Grade 3': [3000, 3793, 3793, 3793, 3793, 3793, 3793],
        'Grade 4': [3000, 3793, 3793, 3793, 3793, 3793, 3793],
        'Grade 5': [3000, 3793, 3793, 3793, 3793, 3793, 3793],
        'Grade 6': [3000, 4316, 4316, 4316, 4316, 4316, 4316]
    }
};

function updateTuitionDisplay() {
    const enrolleeType = document.getElementById('newStudentEnrolleeType').value;
    const grade = document.getElementById('newStudentGrade').value;
    const option = document.getElementById('newStudentPayOption').value;
    const breakdown = document.getElementById('tuitionBreakdown');

    const table = TUITION_DATA[enrolleeType];
    if (!grade || !table || !table[grade]) {
        breakdown.style.display = 'none';
        return;
    }

    const data = table[grade];
    let adjustLabel, adjustAmount, totalPayment, schedule;

    if (option === 'full') {
        const discount = Math.round(data.tuition * 0.03);
        adjustAmount = -discount;
        adjustLabel = 'Less 3%';
        totalPayment = Math.round(data.tuition * 0.97) + data.misc;
        schedule = '1 payment upon enrollment';
    } else if (option === 'two_payments') {
        const interest = Math.round(data.tuition * 0.05);
        adjustAmount = interest;
        adjustLabel = '5% interest';
        totalPayment = Math.round(data.tuition * 1.05) + data.misc;
        const half = Math.round(totalPayment / 2);
        schedule = `₱${half.toLocaleString()} x 2 (June & December)`;
    } else {
        const amounts = MONTHLY_AMOUNTS[enrolleeType][grade];
        adjustAmount = Math.round(data.tuition * 0.07);
        adjustLabel = '7% interest';
        totalPayment = amounts.reduce((a, b) => a + b, 0);
        schedule = `₱${amounts[0].toLocaleString()} (June) + ₱${amounts[1].toLocaleString()} x 6 months (July-December)`;
    }

    document.getElementById('bdTuition').textContent = '₱' + data.tuition.toLocaleString();
    document.getElementById('bdMisc').textContent = '₱' + data.misc.toLocaleString();
    document.getElementById('bdAdjust').textContent = (adjustAmount >= 0 ? '+' : '-') + '₱' + Math.abs(adjustAmount).toLocaleString() + ` (${adjustLabel})`;
    document.getElementById('bdTotal').textContent = '₱' + totalPayment.toLocaleString();
    document.getElementById('bdSchedule').textContent = schedule;
    breakdown.style.display = 'block';
}

// Change Password
async function changeStudentPassword() {
    const password = document.getElementById('newStudentPassword').value;
    if (!password || password.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
    }

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ password })
    });

    if (res.ok) {
        showToast('Password updated!');
        document.getElementById('newStudentPassword').value = '';
    } else {
        const data = await res.json();
        showToast(data.message || 'Error updating password');
    }
}

function hideAddStudentForm() {
    document.getElementById('addStudentForm').style.display = 'none';
}

function previewNewStudentPhoto(input) {
    const preview = document.getElementById('newStudentPhotoPreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function createStudent() {
    const btn = document.querySelector('#addStudentForm .btn-save');
    const originalText = btn.textContent;

    const firstName = document.getElementById('newStudentFirstName').value.trim();
    const middleName = document.getElementById('newStudentMiddleName').value.trim();
    const lastName = document.getElementById('newStudentLastName').value.trim();
    const grade = document.getElementById('newStudentGrade').value;
    const guardian = document.getElementById('newStudentGuardian').value;

    if (!firstName || !lastName || !grade || !guardian) {
        showToast('Please fill in required fields (First Name, Last Name, Grade, Guardian)');
        return;
    }

    const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`;

    // Validate age (must be at least 2 years old)
    const birthDate = getDatePickerValue('newStudentBirth');
    if (birthDate) {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        if (age < 2) {
            showToast('Student must be at least 2 years old');
            return;
        }
    }

    // Show confirmation popup
    showConfirmPopup('Are you sure you want to register this student?', async () => {
        await doCreateStudent(btn, originalText, fullName, grade, guardian);
    });
}

async function doCreateStudent(btn, originalText, fullName, grade, guardian) {
    // Disable button and show loading state
    btn.disabled = true;
    btn.textContent = '⏳ Registering...';

    try {
        const formData = new FormData();
        formData.append('fullName', fullName);
        formData.append('grade', grade);
        formData.append('guardian', guardian);
        formData.append('guardianContact', document.getElementById('newStudentContact').value);
        formData.append('address', document.getElementById('newStudentAddress').value);
        formData.append('birthDate', getDatePickerValue('newStudentBirth'));
        formData.append('gender', document.getElementById('newStudentGender').value);
        formData.append('paymentOption', document.getElementById('newStudentPayOption').value);
        formData.append('enrolleeType', document.getElementById('newStudentEnrolleeType').value);

        const photoFile = document.getElementById('newStudentPhoto').files[0];
        if (photoFile) formData.append('profileImage', photoFile);

        const res = await fetch(`${API_URL}/admin/students`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            const resultEl = document.getElementById('newStudentResult');
            resultEl.style.display = 'block';
            resultEl.innerHTML = `
                <div class="success-card">
                    <h4>✅ Student Registered Successfully!</h4>
                    <p><strong>Student Number:</strong> ${data.credentials.studentNo}</p>
                    <p><strong>Default Password:</strong> ${data.credentials.password}</p>
                    <p class="note">Share these credentials with the student/guardian for portal access.</p>
                </div>
            `;

            // Clear form
            document.getElementById('newStudentFirstName').value = '';
            document.getElementById('newStudentMiddleName').value = '';
            document.getElementById('newStudentLastName').value = '';
            document.getElementById('newStudentGrade').value = '';
            document.getElementById('newStudentGuardian').value = '';
            document.getElementById('newStudentContact').value = '';
            document.getElementById('newStudentAddress').value = '';
            document.getElementById('newStudentBirth').value = '';
            document.getElementById('newStudentBirth').dataset.value = '';
            document.getElementById('newStudentGender').value = '';
            document.getElementById('newStudentPhoto').value = '';
            document.getElementById('newStudentPhotoPreview').style.display = 'none';
            const tuitionBreakdown = document.getElementById('tuitionBreakdown');
            if (tuitionBreakdown) tuitionBreakdown.style.display = 'none';

            showToast('Student registered!');
            loadStudents();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error creating student');
        }
    } catch (err) {
        console.error('Create student error:', err);
        showToast('Cannot connect to server. Please check if the backend is running.');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// Logout
function adminLogout() {
    adminToken = null;
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('loginWrapper').style.display = 'flex';
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
}

// Reply notification check
function startReplyNotificationCheck() {
    // Get initial count
    fetchReplyCount().then(count => { lastReplyCount = count; });

    setInterval(async () => {
        const newCount = await fetchReplyCount();
        if (newCount > lastReplyCount) {
            const diff = newCount - lastReplyCount;
            showNotification(`💬 ${diff} new reply${diff > 1 ? 's' : ''} on announcements`);
            lastReplyCount = newCount;
            loadAnnouncements();
        }
    }, 5000);
}

async function fetchReplyCount() {
    try {
        const res = await fetch(`${API_URL}/announcements`);
        if (!res.ok) return lastReplyCount;
        const announcements = await res.json();
        let total = 0;
        announcements.forEach(a => {
            total += (a.replies || []).filter(r => r.role === 'student').length;
        });
        return total;
    } catch (e) {
        return lastReplyCount;
    }
}

function showNotification(message) {
    // Remove existing notification if any
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'admin-notification';
    notif.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">✕</button>
    `;
    document.body.appendChild(notif);
    setTimeout(() => { if (notif.parentElement) notif.remove(); }, 8000);
}

// Confirmation popup
function showConfirmPopup(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>${message}</p>
            <div class="confirm-buttons">
                <button class="confirm-yes" id="confirmYes">Yes</button>
                <button class="confirm-no" id="confirmNo">No</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#confirmYes').onclick = () => {
        overlay.remove();
        onConfirm();
    };
    overlay.querySelector('#confirmNo').onclick = () => {
        overlay.remove();
    };
}

// Date select helpers
function populateDaySelect(selectId, days) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Day</option>';
    for (let i = 1; i <= days; i++) {
        const val = String(i).padStart(2, '0');
        sel.innerHTML += `<option value="${val}">${i}</option>`;
    }
    if (current && parseInt(current) <= days) sel.value = current;
}

function populateYearSelect(selectId, startYear, endYear) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Year</option>';
    for (let y = startYear; y <= endYear; y++) {
        sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
}

function getDateFromSelects(monthId, dayId, yearId) {
    const m = document.getElementById(monthId)?.value;
    const d = document.getElementById(dayId)?.value;
    const y = document.getElementById(yearId)?.value;
    if (m && d && y) return `${y}-${m}-${d}`;
    return '';
}

function setDateSelects(monthId, dayId, yearId, dateStr) {
    if (!dateStr) return;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const sel = document.getElementById(monthId);
        if (sel) sel.value = parts[1];
        populateDaySelect(dayId, 31);
        const daySel = document.getElementById(dayId);
        if (daySel) daySel.value = parts[2];
        const yearSel = document.getElementById(yearId);
        if (yearSel) yearSel.value = parts[0];
    }
}

// Initialize all date selects on page load
function initDateSelects() {
    // Days (1-31 for all)
    ['newStudentBirthDay', 'editBirthDay', 'payDateDay', 'actDateDay', 'projDueDay'].forEach(id => {
        populateDaySelect(id, 31);
    });

    // Birth years (1950 to current year)
    const currentYear = new Date().getFullYear();
    populateYearSelect('newStudentBirthYear', 1950, currentYear);
    populateYearSelect('editBirthYear', 1950, currentYear);

    // Payment/Activity/Project years (current year range)
    populateYearSelect('payDateYear', currentYear - 1, currentYear + 2);
    populateYearSelect('actDateYear', currentYear - 1, currentYear + 2);
    populateYearSelect('projDueYear', currentYear, currentYear + 2);
}

// Run on DOM load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDateSelects);
} else {
    initDateSelects();
}

// Delete student with confirmation and password
function deleteStudent() {
    if (!selectedStudent) return;

    showConfirmPopup(`Are you sure you want to permanently delete ${selectedStudent.fullName}? This cannot be undone.`, () => {
        showPasswordPrompt(async (password) => {
            const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                showToast('Student deleted successfully');
                backToList();
            } else {
                const data = await res.json();
                showToast(data.message || 'Error deleting student');
            }
        });
    });
}

function showPasswordPrompt(onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>Enter your admin password to confirm deletion:</p>
            <input type="password" id="deletePasswordInput" placeholder="Admin password" style="width:100%;padding:0.7rem 1rem;border:2px solid #eee;border-radius:8px;font-size:1rem;margin-bottom:1rem;">
            <div class="confirm-buttons">
                <button class="confirm-yes" id="passwordConfirmBtn">Confirm</button>
                <button class="confirm-no" id="passwordCancelBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#passwordConfirmBtn').onclick = () => {
        const password = document.getElementById('deletePasswordInput').value;
        if (!password) {
            showToast('Please enter your password');
            return;
        }
        overlay.remove();
        onConfirm(password);
    };
    overlay.querySelector('#passwordCancelBtn').onclick = () => {
        overlay.remove();
    };
    // Allow Enter key
    overlay.querySelector('#deletePasswordInput').onkeydown = (e) => {
        if (e.key === 'Enter') overlay.querySelector('#passwordConfirmBtn').click();
    };
}

// Inquiries
function toggleInquiries() {
    const panel = document.getElementById('inquiriesPanel');
    document.getElementById('addStudentForm').style.display = 'none';
    document.getElementById('announcementForm').style.display = 'none';
    if (panel.style.display === 'block') {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    loadInquiries();
}

async function loadInquiries() {
    const res = await fetch(`${API_URL}/inquiries`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const inquiries = await res.json();
    const list = document.getElementById('inquiriesList');

    if (inquiries.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No inquiries yet.</p>';
        return;
    }

    list.innerHTML = inquiries.map(inq => `
        <div class="inquiry-card inquiry-${inq.status}">
            <div class="inquiry-header">
                <strong>${inq.childName}</strong>
                <span class="inquiry-status-badge status-${inq.status}">${inq.status}</span>
            </div>
            <div class="inquiry-details">
                <p>📧 ${inq.email}</p>
                <p>📞 ${inq.contact}</p>
                <p>📚 ${inq.gradeLevel || 'Not specified'}</p>
                ${inq.message ? `<p>💬 ${inq.message}</p>` : ''}
            </div>
            <div class="inquiry-footer">
                <span class="inquiry-date">${new Date(inq.createdAt).toLocaleString()}</span>
                <div class="inquiry-actions">
                    ${inq.status === 'new' ? `<button class="btn-mark-read" onclick="updateInquiryStatus('${inq._id}', 'read')">Mark Read</button>` : ''}
                    ${inq.status === 'read' ? `<button class="btn-mark-replied" onclick="updateInquiryStatus('${inq._id}', 'replied')">Mark Replied</button>` : ''}
                    <button class="btn-delete-inquiry" onclick="deleteInquiry('${inq._id}')">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function updateInquiryStatus(id, status) {
    await fetch(`${API_URL}/inquiries/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ status })
    });
    loadInquiries();
}

async function deleteInquiry(id) {
    showConfirmPopup('Delete this inquiry?', async () => {
        await fetch(`${API_URL}/inquiries/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        showToast('Inquiry deleted');
        loadInquiries();
    });
}
