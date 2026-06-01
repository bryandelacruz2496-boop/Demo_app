const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000/api' : '/api';
const UPLOADS_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';
let adminToken = localStorage.getItem('adminToken');
let adminRole = localStorage.getItem('adminRole') || 'staff';

// Helper: resolve image URL (handles both Cloudinary full URLs and local /uploads/ paths)
function imgUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return UPLOADS_URL + path;
}
let students = [];
let selectedStudent = null;
let lastReplyCount = 0;

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
    if (adminToken) {
        document.getElementById('loginWrapper').style.display = 'none';
        document.getElementById('adminDashboard').style.display = 'block';
        document.getElementById('adminName').textContent = localStorage.getItem('adminName') || 'Admin';
        adminRole = localStorage.getItem('adminRole') || 'staff';
        applyRoleUI();
        loadStudents();
        startReplyNotificationCheck();
    }

    // Set collection month/year to current
    const now = new Date();
    const monthSelect = document.getElementById('collectionMonth');
    if (monthSelect) monthSelect.value = String(now.getMonth() + 1).padStart(2, '0');

    // Toggle bulk grade selector for discounts
    const discBulkCheckbox = document.getElementById('discBulk');
    if (discBulkCheckbox) {
        discBulkCheckbox.addEventListener('change', function () {
            document.getElementById('discBulkGrade').style.display = this.checked ? 'inline-block' : 'none';
        });
    }
});

// Prevent browser back/forward button from navigating away
history.pushState(null, null, location.href);
window.addEventListener('popstate', function () {
    history.pushState(null, null, location.href);
});

// Login
async function handleAdminLogin(event) {
    event.preventDefault();
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.querySelector('.btn-login');
    const loginForm = document.querySelector('.login-left form');

    // Show loading state
    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="btn-spinner"></span> Logging in...';
    errorEl.textContent = '';

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            adminToken = data.token;
            adminRole = data.admin.role || 'staff';
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminName', data.admin.name);
            localStorage.setItem('adminRole', data.admin.role || 'staff');
            document.getElementById('adminName').textContent = data.admin.name;

            // Show loading data state
            loginBtn.innerHTML = '<span class="btn-spinner"></span> Loading data...';

            // Start fetching data AND a 3-second minimum timer in parallel
            const dataReady = loadStudents().catch(() => { });
            const minDelay = new Promise(resolve => setTimeout(resolve, 3000));

            // Wait for BOTH to complete
            await Promise.all([dataReady, minDelay]);

            // Show success state
            loginBtn.innerHTML = '✓ Login Successful!';
            loginBtn.classList.add('btn-login-success');
            showAdminLoginNotification('✓ Welcome, ' + data.admin.name + '!');

            setTimeout(() => {
                loginBtn.disabled = false;
                loginBtn.innerHTML = originalText;
                loginBtn.classList.remove('btn-login-success');
                document.getElementById('loginWrapper').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                applyRoleUI();
                startReplyNotificationCheck();
            }, 800);
        } else {
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalText;
            errorEl.textContent = data.message;
            loginForm.classList.add('shake');
            setTimeout(() => loginForm.classList.remove('shake'), 600);
        }
    } catch (err) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
        errorEl.textContent = 'Cannot connect to server';
        loginForm.classList.add('shake');
        setTimeout(() => loginForm.classList.remove('shake'), 600);
    }
}

function showAdminLoginNotification(message) {
    const notif = document.createElement('div');
    notif.className = 'login-success-notif';
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => { if (notif.parentElement) notif.remove(); }, 3000);
}

// Load students
async function loadStudents() {
    const res = await fetch(`${API_URL}/admin/students`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    students = await res.json();
    renderStudentList();
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
        ${announcements.map(a => {
        const replies = a.replies || [];
        const hasMore = replies.length > 3;
        const visibleReplies = hasMore ? replies.slice(0, 2) : replies;
        const hiddenReplies = hasMore ? replies.slice(2) : [];
        return `
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
                    ${visibleReplies.map(r => `
                        <div class="reply-item reply-${r.role}">
                            <strong>${r.author}</strong> <span class="reply-role">${r.role}</span>
                            <p>${r.message}</p>
                            <span class="reply-date">${new Date(r.createdAt).toLocaleString()}</span>
                        </div>
                    `).join('')}
                    ${hasMore ? `
                        <div class="replies-collapsed" id="replies-hidden-${a._id}" style="display:none;">
                            ${hiddenReplies.map(r => `
                                <div class="reply-item reply-${r.role}">
                                    <strong>${r.author}</strong> <span class="reply-role">${r.role}</span>
                                    <p>${r.message}</p>
                                    <span class="reply-date">${new Date(r.createdAt).toLocaleString()}</span>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn-view-more-replies" id="btn-toggle-replies-${a._id}" onclick="toggleReplies('${a._id}', ${hiddenReplies.length})">
                            View ${hiddenReplies.length} more repl${hiddenReplies.length === 1 ? 'y' : 'ies'}
                        </button>
                    ` : ''}
                    <div class="reply-form">
                        <input type="text" id="reply-${a._id}" placeholder="Write a reply..." class="reply-input" onkeydown="handleAdminReplyKey(event,'${a._id}')">
                        <button class="btn-reply" onclick="adminReply('${a._id}')">Reply</button>
                    </div>
                </div>
            </div>
        `}).join('')}
    `;
}

function showAnnouncementForm() {
    const form = document.getElementById('announcementForm');
    if (form.style.display === 'block') {
        form.style.display = 'none';
        return;
    }
    form.style.display = 'block';
}

function toggleReplies(announcementId, hiddenCount) {
    const hidden = document.getElementById(`replies-hidden-${announcementId}`);
    const btn = document.getElementById(`btn-toggle-replies-${announcementId}`);
    if (hidden.style.display === 'none') {
        hidden.style.display = 'block';
        btn.textContent = 'Show less';
    } else {
        hidden.style.display = 'none';
        btn.textContent = `View ${hiddenCount} more repl${hiddenCount === 1 ? 'y' : 'ies'}`;
    }
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
        showUploadingOverlay('Posting announcement...');

        try {
            const res = await fetch(`${API_URL}/announcements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ subject, body, targetGrade })
            });

            hideUploadingOverlay();

            if (res.ok) {
                showSuccessToast('✓ Announcement posted successfully!');
                document.getElementById('annSubject').value = '';
                document.getElementById('annBody').value = '';
                document.getElementById('annGrade').value = 'all';
                hideAnnouncementForm();
                loadAnnouncements();
            } else {
                showToast('Failed to post announcement');
            }
        } catch (err) {
            hideUploadingOverlay();
            showToast('Error: Cannot connect to server');
        }
    });
}

async function deleteAnnouncement(id) {
    showConfirmPopup('Are you sure you want to delete this announcement?', async () => {
        const res = await fetch(`${API_URL}/announcements/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showSuccessToast('Announcement deleted successfully');
            loadAnnouncements();
        }
    });
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
    const statusFilter = document.getElementById('collectionStatusFilter') ? document.getElementById('collectionStatusFilter').value : 'all';
    const gradeFilter = document.getElementById('collectionGradeFilter') ? document.getElementById('collectionGradeFilter').value : 'all';

    let collected = 0;
    let pending = 0;
    let collectionRows = [];

    students.forEach(student => {
        // Apply grade filter
        if (gradeFilter !== 'all' && student.grade !== gradeFilter) return;

        student.payments.forEach(payment => {
            if (payment.amount < 0) return; // skip discounts

            // Collected: payments marked as paid where paidDate is in the selected month
            if (payment.status === 'paid' && payment.paidDate && payment.paidDate.startsWith(`${year}-${month}`)) {
                collected += payment.amount;
                collectionRows.push({
                    name: student.fullName,
                    grade: student.grade,
                    description: payment.description,
                    amount: payment.amount,
                    status: 'paid',
                    paidDate: payment.paidDate
                });
            }

            // Pending: payments still pending where scheduled date is in the selected month
            if (payment.status === 'pending' && payment.date && payment.date.startsWith(`${year}-${month}`)) {
                pending += payment.amount;
                collectionRows.push({
                    name: student.fullName,
                    grade: student.grade,
                    description: payment.description,
                    amount: payment.amount,
                    status: 'pending',
                    paidDate: '-'
                });
            }
        });
    });

    // Update summary cards with actual totals from the data
    document.getElementById('monthCollected').textContent = '₱' + collected.toLocaleString();
    document.getElementById('monthPending').textContent = '₱' + pending.toLocaleString();
    document.getElementById('monthTotal').textContent = '₱' + (collected + pending).toLocaleString();

    // Apply status filter for table display only
    let filtered = collectionRows;
    if (statusFilter === 'paid') {
        filtered = collectionRows.filter(r => r.status === 'paid');
    } else if (statusFilter === 'pending') {
        filtered = collectionRows.filter(r => r.status === 'pending');
    }

    // Sort: paid first, then pending
    filtered.sort((a, b) => {
        if (a.status === b.status) return a.name.localeCompare(b.name);
        return a.status === 'paid' ? -1 : 1;
    });

    // Render collection table
    const tbody = document.getElementById('collectionTableBody');
    if (tbody) {
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:2rem;">No records for this month</td></tr>';
        } else {
            // Show subtotal for filtered view
            const filteredTotal = filtered.reduce((sum, r) => sum + r.amount, 0);
            tbody.innerHTML = filtered.map(r => `
                <tr>
                    <td>${r.name}</td>
                    <td>${r.grade}</td>
                    <td>${r.description}</td>
                    <td>₱${r.amount.toLocaleString()}</td>
                    <td><span class="status-${r.status}">${r.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span></td>
                    <td>${r.paidDate}</td>
                </tr>
            `).join('') + `
                <tr style="font-weight:700;background:#f5f5f5;">
                    <td colspan="3">Total (${filtered.length} records)</td>
                    <td>₱${filteredTotal.toLocaleString()}</td>
                    <td colspan="2"></td>
                </tr>
            `;
        }
    }
}

function exportCollectionReport() {
    const table = document.getElementById('collectionTable');
    if (!table) return;
    const month = document.getElementById('collectionMonth');
    const year = document.getElementById('collectionYear');
    const monthName = month.options[month.selectedIndex].text;
    const yearVal = year.value;

    let csv = '';
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach(col => {
            let text = col.textContent.replace(/"/g, '""').trim();
            rowData.push('"' + text + '"');
        });
        csv += rowData.join(',') + '\n';
    });

    // Add summary at top
    const collected = document.getElementById('monthCollected').textContent;
    const pending = document.getElementById('monthPending').textContent;
    const total = document.getElementById('monthTotal').textContent;
    const summary = `"Monthly Collection Report - ${monthName} ${yearVal}"\n"Total Collected","${collected}"\n"Pending","${pending}"\n"Total Expected","${total}"\n\n`;

    const blob = new Blob(['\uFEFF' + summary + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `collection-report-${yearVal}-${month.value}.csv`;
    link.click();
}

function renderStudentList() {
    const filterGrade = document.getElementById('filterGrade') ? document.getElementById('filterGrade').value : 'all';
    const searchTerm = document.getElementById('searchStudent') ? document.getElementById('searchStudent').value.trim().toLowerCase() : '';
    const list = document.getElementById('studentList');

    let filtered = [...students];
    if (filterGrade !== 'all') {
        filtered = filtered.filter(s => s.grade && s.grade.toLowerCase().includes(filterGrade.toLowerCase()));
    }
    if (searchTerm) {
        filtered = filtered.filter(s => s.fullName && s.fullName.toLowerCase().includes(searchTerm));
    }

    list.innerHTML = filtered.map(s => `
    <div class="student-item ${s.status === 'archived' ? 'student-archived' : ''}" onclick="selectStudent('${s._id}')">
      <div class="student-item-info">
        <h4>${s.fullName} ${s.status === 'archived' ? '<span class="archived-badge">Archived</span>' : ''}</h4>
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
    document.querySelector('.admin-sidebar').style.display = 'none';

    document.getElementById('studentHeader').innerHTML = `
    <h2>${selectedStudent.fullName} ${selectedStudent.status === 'archived' ? '<span style="background:rgba(255,255,255,0.3);padding:0.2rem 0.8rem;border-radius:15px;font-size:0.8rem;">Archived</span>' : ''}</h2>
    <p>${selectedStudent.studentNo} • ${selectedStudent.grade} • Guardian: ${selectedStudent.guardian}</p>
  `;

    // Show/hide archive buttons
    if (selectedStudent.status === 'archived') {
        document.getElementById('btnArchiveStudent').style.display = 'none';
        document.getElementById('btnUnarchiveStudent').style.display = adminRole === 'superadmin' ? 'inline-block' : 'none';
    } else {
        document.getElementById('btnArchiveStudent').style.display = adminRole === 'superadmin' ? 'inline-block' : 'none';
        document.getElementById('btnUnarchiveStudent').style.display = 'none';
    }

    // Hide delete button for staff and admin
    if (adminRole === 'staff' || adminRole === 'admin') {
        document.querySelector('.btn-delete-student').style.display = 'none';
    }

    renderProfile();
    renderGrades();
    setAssessmentReadOnly();
    renderPayments();
    renderActivities();
    renderProjects();
    applyRoleUI();
}

// Profile
let profileEditMode = false;

function renderProfile() {
    // Photo
    const photoWrapper = document.getElementById('profilePhotoWrapper');
    if (selectedStudent.profileImage) {
        photoWrapper.innerHTML = `<img src="${imgUrl(selectedStudent.profileImage)}" class="profile-img">`;
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
    document.querySelector('.admin-sidebar').style.display = 'flex';
    loadStudents();
}

// Grades
function renderGrades() {
    const form = document.getElementById('gradesForm');
    form.innerHTML = `
    <div class="assessments-list">
      ${selectedStudent.assessments.map((a, i) => `
        <div class="assessment-card">
          <div class="assessment-card-header">
            <strong>${a.subject}</strong>
            <button class="btn-remove-subject" onclick="removeSubject(${i})">✕</button>
          </div>
          <div class="assessment-grid">
            <div class="assessment-quarter">
              <label>Q1 Remarks</label>
              <textarea id="q1_${i}" placeholder="Enter remarks for Q1...">${a.q1 || ''}</textarea>
            </div>
            <div class="assessment-quarter">
              <label>Q2 Remarks</label>
              <textarea id="q2_${i}" placeholder="Enter remarks for Q2...">${a.q2 || ''}</textarea>
            </div>
            <div class="assessment-quarter">
              <label>Q3 Remarks</label>
              <textarea id="q3_${i}" placeholder="Enter remarks for Q3...">${a.q3 || ''}</textarea>
            </div>
            <div class="assessment-quarter">
              <label>Q4 Remarks</label>
              <textarea id="q4_${i}" placeholder="Enter remarks for Q4...">${a.q4 || ''}</textarea>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
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
    enableAssessmentEdit();
}

function removeSubject(index) {
    selectedStudent.assessments.splice(index, 1);
    renderGrades();
    enableAssessmentEdit();
}

function enableAssessmentEdit() {
    document.querySelectorAll('#gradesForm textarea').forEach(t => t.disabled = false);
    document.querySelectorAll('#gradesForm .btn-remove-subject').forEach(b => b.style.display = 'inline-block');
    document.querySelector('.add-subject-row').style.display = 'flex';
    document.getElementById('btnEditAssessment').style.display = 'none';
    document.getElementById('btnSaveAssessment').style.display = 'inline-block';
    document.getElementById('btnCancelAssessment').style.display = 'inline-block';
}

function cancelAssessmentEdit() {
    renderGrades();
    setAssessmentReadOnly();
}

function setAssessmentReadOnly() {
    document.querySelectorAll('#gradesForm textarea').forEach(t => t.disabled = true);
    document.querySelectorAll('#gradesForm .btn-remove-subject').forEach(b => b.style.display = 'none');
    const addRow = document.querySelector('.add-subject-row');
    if (addRow) addRow.style.display = 'none';
    document.getElementById('btnEditAssessment').style.display = 'inline-block';
    document.getElementById('btnSaveAssessment').style.display = 'none';
    document.getElementById('btnCancelAssessment').style.display = 'none';
}

async function saveGrades() {
    const assessments = selectedStudent.assessments.map((a, i) => ({
        subject: a.subject,
        q1: document.getElementById(`q1_${i}`).value.trim() || null,
        q2: document.getElementById(`q2_${i}`).value.trim() || null,
        q3: document.getElementById(`q3_${i}`).value.trim() || null,
        q4: document.getElementById(`q4_${i}`).value.trim() || null
    }));

    const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/assessments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ assessments })
    });

    if (res.ok) {
        showToast('Assessments saved successfully!');
        const data = await res.json();
        selectedStudent.assessments = data.assessments;
        renderGrades();
        setAssessmentReadOnly();
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

    body.innerHTML = payments.map(p => {
        const isDiscount = p.amount < 0;
        const isExpense = p.description && p.description.startsWith('[Expense]');
        const displayDesc = isExpense ? p.description.replace('[Expense] ', '') : p.description;
        return `
    <tr${isDiscount ? ' style="background:#e8f5e9;"' : isExpense ? ' style="background:#fff3e0;"' : ''}>
      <td>${p.date}</td>
      <td>${displayDesc}${isExpense ? ' 📋' : ''}</td>
      <td>${isDiscount ? '-₱' + Math.abs(p.amount).toLocaleString() : '₱' + p.amount.toLocaleString()}</td>
      <td><span class="status-${p.status}">${isDiscount ? '✓ Discount' : isExpense ? '📋 Expense' : (p.status === 'paid' ? '✓ Paid' : '⏳ Pending')}</span></td>
      <td>${p.paidDate || '-'}</td>
      <td>
        ${isDiscount ? `<button class="btn-status btn-mark-pending" onclick="removeDiscount('${p._id}')">Remove</button>` :
                (p.status === 'pending'
                    ? `<button class="btn-status btn-mark-paid" onclick="updatePaymentStatus('${p._id}', 'paid')">Mark Paid</button>`
                    : `<button class="btn-status btn-mark-pending" onclick="updatePaymentStatus('${p._id}', 'pending')">Mark Pending</button>`
                )
            }
      </td>
    </tr>
    `;
    }).join('');

    if (payments.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:2rem;">No payments found</td></tr>';
    }

    // Re-apply role restrictions after rendering payment table
    if (adminRole === 'staff') {
        document.querySelectorAll('#paymentsBody .btn-mark-paid, #paymentsBody .btn-mark-pending').forEach(btn => {
            btn.style.display = 'none';
        });
    }
}

function onDiscountTypeChange() {
    const discType = document.getElementById('discType').value;
    const descInput = document.getElementById('discDesc');
    const amountInput = document.getElementById('discAmount');

    if (discType === 'referral') {
        descInput.value = 'Referral Fee Discount';
        descInput.readOnly = true;
        amountInput.value = '250';
        amountInput.readOnly = true;
    } else if (discType === 'siblings') {
        descInput.value = 'Siblings Discount (10%)';
        descInput.readOnly = true;
        const tuition = selectedStudent ? selectedStudent.totalTuition || 0 : 0;
        amountInput.value = Math.round(tuition * 0.10);
        amountInput.readOnly = true;
    } else if (discType === 'early_bird') {
        descInput.value = 'Early Bird Discount (5%)';
        descInput.readOnly = true;
        const tuition = selectedStudent ? selectedStudent.totalTuition || 0 : 0;
        amountInput.value = Math.round(tuition * 0.05);
        amountInput.readOnly = true;
    } else {
        descInput.value = '';
        descInput.readOnly = false;
        amountInput.value = '';
        amountInput.readOnly = false;
    }
}

function togglePaymentForm() {
    const payForm = document.getElementById('addPaymentForm');
    const discForm = document.getElementById('addDiscountForm');
    const expForm = document.getElementById('addExpenseForm');
    if (payForm.style.display === 'none') {
        payForm.style.display = 'block';
        discForm.style.display = 'none';
        expForm.style.display = 'none';
    } else {
        payForm.style.display = 'none';
    }
}

function toggleDiscountForm() {
    const payForm = document.getElementById('addPaymentForm');
    const discForm = document.getElementById('addDiscountForm');
    const expForm = document.getElementById('addExpenseForm');
    if (discForm.style.display === 'none') {
        discForm.style.display = 'block';
        payForm.style.display = 'none';
        expForm.style.display = 'none';
    } else {
        discForm.style.display = 'none';
    }
}

function toggleExpenseForm() {
    const payForm = document.getElementById('addPaymentForm');
    const discForm = document.getElementById('addDiscountForm');
    const expForm = document.getElementById('addExpenseForm');
    if (expForm.style.display === 'none') {
        expForm.style.display = 'block';
        payForm.style.display = 'none';
        discForm.style.display = 'none';
    } else {
        expForm.style.display = 'none';
    }
}

async function addExpense() {
    const date = getDatePickerValue('expDate');
    const description = document.getElementById('expDesc').value.trim();
    const amount = Number(document.getElementById('expAmount').value);
    const status = document.getElementById('expStatus').value;

    if (!date || !description || !amount) {
        showToast('Please fill in all expense fields');
        return;
    }

    showPasswordPrompt(async (password) => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/expense`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ date, description, amount, status, password })
        });

        if (res.ok) {
            const data = await res.json();
            selectedStudent.payments = data.payments;
            if (data.totalTuition !== undefined) selectedStudent.totalTuition = data.totalTuition;
            renderPayments();
            showToast('Expense added!');
            document.getElementById('expDate').value = '';
            document.getElementById('expDate').dataset.value = '';
            document.getElementById('expDesc').value = '';
            document.getElementById('expAmount').value = '';
        } else {
            const data = await res.json();
            showToast(data.message || 'Error adding expense');
        }
    });
}

async function addDiscount() {
    const date = getDatePickerValue('discDate');
    const description = document.getElementById('discDesc').value;
    const amount = Number(document.getElementById('discAmount').value);
    const isBulk = document.getElementById('discBulk').checked;

    if (!date || !description || !amount) {
        showToast('Please fill in all discount fields');
        return;
    }

    showConfirmPopup(`Are you sure you want to apply a ₱${amount.toLocaleString()} discount${isBulk ? ' to ALL students' : ''}?`, () => {
        showPasswordPrompt(async (password) => {
            if (isBulk) {
                const grade = document.getElementById('discBulkGrade').value;
                const res = await fetch(`${API_URL}/admin/students-discount-bulk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                    body: JSON.stringify({ date, description, amount, grade, password })
                });

                if (res.ok) {
                    const data = await res.json();
                    showToast(`Discount applied to ${data.updatedCount} students!`);
                    loadStudents();
                    document.getElementById('discDate').value = '';
                    document.getElementById('discDate').dataset.value = '';
                    document.getElementById('discDesc').value = '';
                    document.getElementById('discAmount').value = '';
                    document.getElementById('discType').value = 'custom';
                    document.getElementById('discDesc').readOnly = false;
                    document.getElementById('discAmount').readOnly = false;
                    document.getElementById('discBulk').checked = false;
                    document.getElementById('discBulkGrade').style.display = 'none';
                } else {
                    const data = await res.json();
                    showToast(data.message || 'Error applying discount');
                }
            } else {
                if (!selectedStudent) return;
                const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/discount`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                    body: JSON.stringify({ date, description, amount, password })
                });

                if (res.ok) {
                    const data = await res.json();
                    selectedStudent.payments = data.payments;
                    selectedStudent.totalTuition = data.totalTuition;
                    renderPayments();
                    showToast('Discount applied!');
                    document.getElementById('discDate').value = '';
                    document.getElementById('discDate').dataset.value = '';
                    document.getElementById('discDesc').value = '';
                    document.getElementById('discAmount').value = '';
                    document.getElementById('discType').value = 'custom';
                    document.getElementById('discDesc').readOnly = false;
                    document.getElementById('discAmount').readOnly = false;
                } else {
                    const data = await res.json();
                    showToast(data.message || 'Error applying discount');
                }
            }
        });
    });
}

async function addPayment() {
    const date = getDatePickerValue('payDate');
    const description = document.getElementById('payDesc').value;
    const amount = Number(document.getElementById('payAmount').value);
    const status = document.getElementById('payStatus').value;

    if (!date || !description || !amount) return;

    showPasswordPrompt(async (password) => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ date, description, amount, status, password })
        });

        if (res.ok) {
            const data = await res.json();
            selectedStudent.payments = data.payments;
            if (data.totalTuition !== undefined) selectedStudent.totalTuition = data.totalTuition;
            renderPayments();
            showToast('Payment added!');
            document.getElementById('payDate').value = '';
            document.getElementById('payDate').dataset.value = '';
            document.getElementById('payDesc').value = '';
            document.getElementById('payAmount').value = '';
        } else {
            const data = await res.json();
            showToast(data.message || 'Error adding payment');
        }
    });
}

async function updatePaymentStatus(paymentId, status) {
    const msg = status === 'paid' ? 'Are you sure you want to mark this payment as paid?' : 'Are you sure you want to mark this payment as pending?';
    showConfirmPopup(msg, () => {
        showPasswordPrompt(async (password) => {
            const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/payments/${paymentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ status, password })
            });

            if (res.ok) {
                const data = await res.json();
                selectedStudent.payments = data.payments;
                renderPayments();
                showToast('Payment status updated!');
            } else {
                const data = await res.json();
                showToast(data.message || 'Error updating payment');
            }
        });
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
      ${a.imageUrl ? `<img src="${imgUrl(a.imageUrl)}" class="activity-image" onclick="viewImage('${imgUrl(a.imageUrl)}')">` : ''}
    </div>
  `).join('');
}

async function deleteActivity(activityId) {
    showConfirmPopup('Are you sure you want to delete this activity?', async () => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/activities/${activityId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            selectedStudent.activities = data.activities;
            renderActivities();
            showSuccessToast('Activity deleted successfully');
        }
    });
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
        // Show uploading overlay
        showUploadingOverlay(imageFile ? 'Uploading activity with photo...' : 'Adding activity...');

        const formData = new FormData();
        formData.append('title', title);
        formData.append('subject', subject);
        formData.append('date', date);
        formData.append('description', description);
        if (imageFile) formData.append('image', imageFile);

        try {
            const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/activities`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${adminToken}` },
                body: formData
            });

            hideUploadingOverlay();

            if (res.ok) {
                const data = await res.json();
                selectedStudent.activities = data.activities;
                renderActivities();
                showSuccessToast('✓ Activity added successfully!');
                document.getElementById('actTitle').value = '';
                document.getElementById('actSubject').value = '';
                document.getElementById('actDate').value = '';
                document.getElementById('actDate').dataset.value = '';
                document.getElementById('actDesc').value = '';
                document.getElementById('actImage').value = '';
                document.getElementById('actImagePreview').style.display = 'none';
            } else {
                showToast('Failed to add activity');
            }
        } catch (err) {
            hideUploadingOverlay();
            showToast('Error: Cannot connect to server');
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
    showConfirmPopup('Are you sure you want to delete this project?', async () => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/projects/${projectId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            selectedStudent.projects = data.projects;
            renderProjects();
            showSuccessToast('Project deleted successfully');
        }
    });
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

// Admin View switching (Students / Announcements / Messages)
function switchAdminView(viewId) {
    document.querySelectorAll('.admin-view').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(viewId);
    view.style.display = 'block';
    view.classList.add('active');
    if (event && event.target) event.target.classList.add('active');

    // Close all open forms when switching views
    const expandablePanels = document.querySelectorAll('.expandable-panel');
    expandablePanels.forEach(p => p.style.display = 'none');
    const announcementForm = document.getElementById('announcementForm');
    if (announcementForm) announcementForm.style.display = 'none';
    const projectForm = document.getElementById('globalProjectForm');
    if (projectForm) projectForm.style.display = 'none';

    // Load data for the view
    if (viewId === 'messagesView') loadInquiries();
    if (viewId === 'announcementsView') loadAnnouncements();
    if (viewId === 'projectsView') loadGlobalProjects();
    if (viewId === 'auditView') loadAuditLog();
    if (viewId === 'attendanceView') loadAttendance();
    if (viewId === 'collectionsView') calculateCollection();
    if (viewId === 'archivedView') loadArchivedStudents();
    if (viewId === 'staffView') loadStaffList();
    if (viewId === 'websiteView') loadWebsiteContent();
}

// Toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showUploadingOverlay(message) {
    const overlay = document.createElement('div');
    overlay.className = 'uploading-overlay';
    overlay.id = 'uploadingOverlay';
    overlay.innerHTML = `
        <div class="uploading-modal">
            <div class="uploading-spinner"></div>
            <p>${message || 'Uploading...'}</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideUploadingOverlay() {
    const overlay = document.getElementById('uploadingOverlay');
    if (overlay) overlay.remove();
}

// Add Student
function showAddStudentForm() {
    const form = document.getElementById('addStudentForm');
    if (form.style.display === 'block') {
        form.style.display = 'none';
        return;
    }
    form.style.display = 'block';
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
    const discountType = document.getElementById('newStudentDiscount') ? document.getElementById('newStudentDiscount').value : 'none';
    const breakdown = document.getElementById('tuitionBreakdown');

    const table = TUITION_DATA[enrolleeType];
    if (!grade || !table || !table[grade]) {
        breakdown.style.display = 'none';
        return;
    }

    const data = table[grade];
    let baseTuition = data.tuition;
    const misc = data.misc;

    // Apply discount on tuition FIRST
    let discountAmount = 0;
    let discountLabel = '';
    if (discountType === 'siblings') {
        discountAmount = Math.round(baseTuition * 0.10);
        discountLabel = 'Siblings Discount (-10%)';
    } else if (discountType === 'friends_family') {
        discountAmount = Math.round(baseTuition * 0.10);
        discountLabel = 'Friends & Family (-10%)';
    } else if (discountType === 'employee') {
        discountAmount = Math.round(baseTuition * 0.30);
        discountLabel = 'Employee Discount (-30%)';
    } else if (discountType === 'early_bird') {
        discountAmount = Math.round(baseTuition * 0.05);
        discountLabel = 'Early Bird (-5%)';
    } else if (discountType === 'late_enrollment') {
        discountAmount = -1000;
        discountLabel = 'Late Enrollment (+₱1,000)';
    }

    // Tuition after discount
    const discountedTuition = baseTuition - discountAmount;

    // Apply payment scheme on BASE tuition (not discounted)
    let adjustLabel, adjustAmount, totalPayment, schedule;

    if (option === 'full') {
        const less3 = Math.round(baseTuition * 0.03);
        adjustAmount = -less3;
        adjustLabel = 'Less 3%';
        totalPayment = baseTuition - less3 - discountAmount + misc;
        schedule = '1 payment upon enrollment';
    } else if (option === 'two_payments') {
        const interest = Math.round(baseTuition * 0.05);
        adjustAmount = interest;
        adjustLabel = '5% interest';
        totalPayment = baseTuition + interest - discountAmount + misc;
        const half = Math.round(totalPayment / 2);
        schedule = `₱${half.toLocaleString()} x 2 (June & December)`;
    } else {
        const interest = Math.round(baseTuition * 0.07);
        adjustAmount = interest;
        adjustLabel = '7% interest';
        totalPayment = baseTuition + interest - discountAmount + misc;
        const monthly = Math.round((totalPayment - 3000) / 6);
        schedule = `₱3,000 (June) + ₱${monthly.toLocaleString()} x 6 months (July-December)`;
    }

    document.getElementById('bdTuition').textContent = '₱' + baseTuition.toLocaleString();
    document.getElementById('bdMisc').textContent = '₱' + misc.toLocaleString();
    document.getElementById('bdAdjust').textContent = (adjustAmount >= 0 ? '+' : '-') + '₱' + Math.abs(adjustAmount).toLocaleString() + ` (${adjustLabel})`;

    // Remove old discount row if exists
    const oldDiscount = document.getElementById('bdDiscountRow');
    if (oldDiscount) oldDiscount.remove();

    // Insert discount row before total
    if (discountType !== 'none') {
        const bdContainer = document.querySelector('.tuition-breakdown');
        const discountRow = document.createElement('div');
        discountRow.id = 'bdDiscountRow';
        discountRow.className = 'breakdown-row';
        discountRow.style.color = discountAmount > 0 ? '#2e7d32' : '#c62828';
        discountRow.innerHTML = `<span>${discountLabel}:</span><strong>${discountAmount > 0 ? '-' : '+'}₱${Math.abs(discountAmount).toLocaleString()}</strong>`;
        const totalRow = bdContainer.querySelector('.breakdown-row.total');
        bdContainer.insertBefore(discountRow, totalRow);
    }

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
    const enrolleeType = document.getElementById('newStudentEnrolleeType').value;
    const confirmMsg = selectedOldStudent
        ? `Are you sure you want to re-enroll ${selectedOldStudent.fullName} with updated details?`
        : 'Are you sure you want to register this student?';

    showConfirmPopup(confirmMsg, async () => {
        if (selectedOldStudent && enrolleeType === 'old') {
            await doReenrollStudent(btn, originalText, fullName, grade, guardian);
        } else {
            await doCreateStudent(btn, originalText, fullName, grade, guardian);
        }
    });
}

async function doReenrollStudent(btn, originalText, fullName, grade, guardian) {
    btn.disabled = true;
    btn.textContent = '⏳ Updating...';

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
        formData.append('enrolleeType', 'old');

        const photoFile = document.getElementById('newStudentPhoto').files[0];
        if (photoFile) formData.append('profileImage', photoFile);

        const res = await fetch(`${API_URL}/admin/students/${selectedOldStudent._id}/reenroll`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: formData
        });

        if (res.ok) {
            const data = await res.json();
            showToast('Student re-enrolled successfully!');
            selectedOldStudent = null;
            document.getElementById('oldStudentSearch').value = '';
            document.getElementById('oldStudentResults').innerHTML = '';
            hideAddStudentForm();
            loadStudents();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error re-enrolling student');
        }
    } catch (err) {
        showToast('Cannot connect to server');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
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
        formData.append('discount', document.getElementById('newStudentDiscount') ? document.getElementById('newStudentDiscount').value : 'none');

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
                    <button class="btn-save" onclick="hideAddStudentForm(); document.getElementById('newStudentResult').style.display='none';" style="margin-top:1rem;">✓ Done</button>
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

            // Auto-hide form after 5 seconds so the updated list is visible
            setTimeout(() => {
                hideAddStudentForm();
                resultEl.style.display = 'none';
            }, 5000);
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
function confirmAdminLogout() {
    document.getElementById('logoutModal').style.display = 'flex';
}

function closeLogoutModal() {
    document.getElementById('logoutModal').style.display = 'none';
}

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
        <div class="confirm-modal">
            <p>${message}</p>
            <div class="confirm-modal-actions">
                <button class="btn-confirm-yes" id="confirmYes">Yes</button>
                <button class="btn-confirm-no" id="confirmNo">No</button>
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
        <div class="confirm-modal">
            <p>Enter your admin password to confirm:</p>
            <input type="password" id="deletePasswordInput" placeholder="Admin password" class="password-prompt-input">
            <div class="confirm-modal-actions">
                <button class="btn-confirm-yes" id="passwordConfirmBtn">Yes</button>
                <button class="btn-confirm-no" id="passwordCancelBtn">No</button>
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

async function removeDiscount(paymentId) {
    showConfirmPopup('Are you sure you want to remove this discount?', () => {
        showPasswordPrompt(async (password) => {
            const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/payments/${paymentId}/remove-discount`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ password })
            });

            if (res.ok) {
                const data = await res.json();
                selectedStudent.payments = data.payments;
                selectedStudent.totalTuition = data.totalTuition;
                renderPayments();
                showToast('Discount removed!');
            } else {
                const data = await res.json();
                showToast(data.message || 'Error removing discount');
            }
        });
    });
}

// Inquiries
function toggleInquiries() {
    switchAdminView('messagesView');
    // Update nav button active state
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-nav-btn')[2].classList.add('active');
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

// Archive / Unarchive
function archiveStudent() {
    if (!selectedStudent) return;
    showConfirmPopup(`Are you sure you want to archive ${selectedStudent.fullName}? The student will be hidden from the active list.`, () => {
        showPasswordPrompt(async (password) => {
            const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/archive`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ password })
            });
            if (res.ok) {
                showSuccessToast('Student archived successfully');
                backToList();
            } else {
                const data = await res.json();
                showToast(data.message || 'Error archiving student');
            }
        });
    });
}

function unarchiveStudent() {
    if (!selectedStudent) return;
    showConfirmPopup(`Are you sure you want to unarchive ${selectedStudent.fullName}?`, async () => {
        const res = await fetch(`${API_URL}/admin/students/${selectedStudent._id}/unarchive`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('Student unarchived');
            backToList();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error unarchiving student');
        }
    });
}

function toggleShowArchived() {
    loadStudents();
}

async function loadArchivedStudents() {
    const res = await fetch(`${API_URL}/admin/students?includeArchived=true`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const allStudents = await res.json();
    const archived = allStudents.filter(s => s.status === 'archived');
    const list = document.getElementById('archivedStudentList');

    if (archived.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No archived students.</p>';
        return;
    }

    list.innerHTML = archived.map(s => `
        <div class="student-item student-archived">
            <div class="student-item-info">
                <h4>${s.fullName} <span class="archived-badge">Archived</span></h4>
                <p>${s.studentNo} • ${s.grade}</p>
            </div>
            <button class="btn-add" style="font-size:0.8rem;padding:0.4rem 0.8rem;" onclick="unarchiveFromList('${s._id}')">Unarchive</button>
        </div>
    `).join('');
}

async function unarchiveFromList(studentId) {
    showConfirmPopup('Are you sure you want to unarchive this student?', async () => {
        const res = await fetch(`${API_URL}/admin/students/${studentId}/unarchive`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('Student unarchived');
            loadArchivedStudents();
            loadStudents();
        } else {
            showToast('Error unarchiving student');
        }
    });
}

// Old Student Search & Re-enrollment
let selectedOldStudent = null;

function handleEnrolleeTypeChange() {
    const type = document.getElementById('newStudentEnrolleeType').value;
    const searchBox = document.getElementById('oldStudentSearchBox');
    if (type === 'old') {
        searchBox.style.display = 'block';
    } else {
        searchBox.style.display = 'none';
        selectedOldStudent = null;
        document.getElementById('oldStudentSearch').value = '';
        document.getElementById('oldStudentResults').innerHTML = '';
        // Clear all form fields
        document.getElementById('newStudentFirstName').value = '';
        document.getElementById('newStudentMiddleName').value = '';
        document.getElementById('newStudentLastName').value = '';
        document.getElementById('newStudentGuardian').value = '';
        document.getElementById('newStudentContact').value = '';
        document.getElementById('newStudentAddress').value = '';
        document.getElementById('newStudentBirth').value = '';
        document.getElementById('newStudentBirth').dataset.value = '';
        document.getElementById('newStudentGender').value = '';
        document.getElementById('newStudentGrade').value = '';
        document.getElementById('newStudentPayOption').value = 'full';
    }
    updateTuitionDisplay();
}

// Show search box on page load since "Old Student" is default
document.addEventListener('DOMContentLoaded', () => {
    const searchBox = document.getElementById('oldStudentSearchBox');
    if (searchBox) searchBox.style.display = 'block';
});

function searchExistingStudent(query) {
    const results = document.getElementById('oldStudentResults');
    if (!query || query.length < 2) {
        results.innerHTML = '';
        return;
    }

    const q = query.toLowerCase();
    const matches = students.filter(s =>
        s.fullName.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q)
    ).slice(0, 5);

    if (matches.length === 0) {
        results.innerHTML = '<p class="no-results">No students found</p>';
        return;
    }

    results.innerHTML = matches.map(s => `
        <div class="old-student-item" onclick="selectOldStudent('${s._id}')">
            <strong>${s.fullName}</strong>
            <span>${s.studentNo} • ${s.grade || 'No grade'}</span>
        </div>
    `).join('');
}

function selectOldStudent(id) {
    const student = students.find(s => s._id === id);
    if (!student) return;

    selectedOldStudent = student;
    document.getElementById('oldStudentSearch').value = student.fullName;
    document.getElementById('oldStudentResults').innerHTML = `
        <div class="old-student-selected">
            ✅ Selected: <strong>${student.fullName}</strong> (${student.studentNo})
            <p>Grade, payment scheme, and other details will be updated upon registration.</p>
        </div>
    `;

    // Auto-fill the form with existing data
    const nameParts = student.fullName.split(' ');
    if (nameParts.length >= 3) {
        document.getElementById('newStudentFirstName').value = nameParts[0];
        document.getElementById('newStudentMiddleName').value = nameParts.slice(1, -1).join(' ');
        document.getElementById('newStudentLastName').value = nameParts[nameParts.length - 1];
    } else if (nameParts.length === 2) {
        document.getElementById('newStudentFirstName').value = nameParts[0];
        document.getElementById('newStudentMiddleName').value = '';
        document.getElementById('newStudentLastName').value = nameParts[1];
    } else {
        document.getElementById('newStudentFirstName').value = student.fullName;
    }

    document.getElementById('newStudentGuardian').value = student.guardian || '';
    document.getElementById('newStudentContact').value = student.guardianContact || '';
    document.getElementById('newStudentAddress').value = student.address || '';
    if (student.birthDate) setDatePickerValue('newStudentBirth', student.birthDate);
    document.getElementById('newStudentGender').value = student.gender || '';
    if (student.grade) {
        const gradeSelect = document.getElementById('newStudentGrade');
        for (let opt of gradeSelect.options) {
            if (student.grade.includes(opt.value)) { gradeSelect.value = opt.value; break; }
        }
    }
    updateTuitionDisplay();
}

// Global Projects
function showGlobalProjectForm() {
    const form = document.getElementById('globalProjectForm');
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

function hideGlobalProjectForm() {
    document.getElementById('globalProjectForm').style.display = 'none';
}

async function createGlobalProject() {
    const title = document.getElementById('globalProjTitle').value;
    const subject = document.getElementById('globalProjSubject').value;
    const dueDate = getDatePickerValue('globalProjDue');
    const description = document.getElementById('globalProjDesc').value;
    const targetGrade = document.getElementById('globalProjGrade').value;

    if (!title || !subject || !dueDate || !description) {
        showToast('Please fill in all required fields');
        return;
    }

    showConfirmPopup('Are you sure you want to post this project?', async () => {
        const res = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ title, subject, dueDate, description, targetGrade })
        });

        if (res.ok) {
            showToast('Project posted!');
            document.getElementById('globalProjTitle').value = '';
            document.getElementById('globalProjSubject').value = '';
            document.getElementById('globalProjDue').value = '';
            document.getElementById('globalProjDue').dataset.value = '';
            document.getElementById('globalProjDesc').value = '';
            document.getElementById('globalProjGrade').value = 'all';
            hideGlobalProjectForm();
            loadGlobalProjects();
        }
    });
}

async function loadGlobalProjects() {
    const res = await fetch(`${API_URL}/projects`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const projects = await res.json();
    const list = document.getElementById('globalProjectsList');

    if (projects.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No projects yet.</p>';
        return;
    }

    list.innerHTML = projects.map(p => `
        <div class="announcement-card">
            <div class="announcement-header">
                <h4>${p.title}</h4>
                <div>
                    <span class="announcement-badge">${p.targetGrade === 'all' ? 'All Grades' : p.targetGrade}</span>
                    <button class="btn-remove-subject" onclick="deleteGlobalProject('${p._id}')">🗑️</button>
                </div>
            </div>
            <p><strong>${p.subject}</strong> • Due: ${p.dueDate}</p>
            <p>${p.description}</p>
            <span class="announcement-date">Posted: ${new Date(p.createdAt).toLocaleDateString()}</span>
        </div>
    `).join('');
}

async function deleteGlobalProject(id) {
    showConfirmPopup('Delete this project?', async () => {
        const res = await fetch(`${API_URL}/projects/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('Project deleted');
            loadGlobalProjects();
        }
    });
}

// ============================================
// FEATURE: Export to CSV
// ============================================
async function exportStudentList() {
    const res = await fetch(`${API_URL}/exports/students`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'students.csv'; a.click();
    URL.revokeObjectURL(url);
}

async function exportStudentPayments() {
    if (!selectedStudent) return;
    const res = await fetch(`${API_URL}/exports/payments/${selectedStudent._id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `payments_${selectedStudent.studentNo}.csv`; a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// FEATURE: Audit Log
// ============================================
let auditLogs = [];
let allAuditActions = [];
let auditPage = 1;
let auditFilterAction = 'all';
const auditPerPage = 15;

async function loadAuditLog() {
    const res = await fetch(`${API_URL}/audit`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    auditLogs = await res.json();

    // Fetch all distinct action types from the database
    try {
        const actionsRes = await fetch(`${API_URL}/audit/actions`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (actionsRes.ok) {
            allAuditActions = await actionsRes.json();
        } else {
            allAuditActions = [...new Set(auditLogs.map(log => log.action))].sort();
        }
    } catch (e) {
        allAuditActions = [...new Set(auditLogs.map(log => log.action))].sort();
    }

    auditPage = 1;
    auditFilterAction = allAuditActions.length > 0 ? allAuditActions[0] : '';
    renderAuditLog();
}

function getFilteredAuditLogs() {
    return auditLogs.filter(log => log.action === auditFilterAction);
}

function onAuditFilterChange() {
    auditFilterAction = document.getElementById('auditActionFilter').value;
    auditPage = 1;
    renderAuditLog();
}

function renderAuditLog() {
    const list = document.getElementById('auditLogList');
    if (auditLogs.length === 0) {
        list.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No activity yet.</p>';
        return;
    }

    // Get unique actions for the filter dropdown
    const uniqueActions = allAuditActions.length > 0 ? allAuditActions : [...new Set(auditLogs.map(log => log.action))].sort();

    const filtered = getFilteredAuditLogs();
    const totalPages = Math.ceil(filtered.length / auditPerPage);
    const start = (auditPage - 1) * auditPerPage;
    const end = start + auditPerPage;
    const pageLogs = filtered.slice(start, end);

    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = '<div class="pagination">';
        paginationHtml += `<button class="page-btn" onclick="changeAuditPage(${auditPage - 1})" ${auditPage === 1 ? 'disabled' : ''}>&lt;</button>`;

        // Smart pagination: show first, last, current, and neighbors
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= auditPage - 1 && i <= auditPage + 1)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }
        pages.forEach(p => {
            if (p === '...') {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            } else {
                paginationHtml += `<button class="page-btn ${p === auditPage ? 'active' : ''}" onclick="changeAuditPage(${p})">${p}</button>`;
            }
        });

        paginationHtml += `<button class="page-btn" onclick="changeAuditPage(${auditPage + 1})" ${auditPage === totalPages ? 'disabled' : ''}>&gt;</button>`;
        paginationHtml += '</div>';
    }

    list.innerHTML = `
        <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap;">
            <button class="btn-action" onclick="exportAuditLog()">Export Excel</button>
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <label style="font-weight:600;font-size:0.9rem;">Filter Action:</label>
                <select id="auditActionFilter" onchange="onAuditFilterChange()" style="padding:0.4rem 0.8rem;border:2px solid #ddd;border-radius:8px;font-size:0.9rem;">
                    ${uniqueActions.map(a => `<option value="${a}" ${auditFilterAction === a ? 'selected' : ''}>${a.replace(/_/g, ' ')}</option>`).join('')}
                </select>
            </div>
            <span style="color:#888;font-size:0.85rem;">${filtered.length} record${filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="table-wrapper">
            <table class="admin-table" id="auditLogTable">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>Performed By</th>
                        <th>Student</th>
                        <th>IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageLogs.map(log => `
                        <tr>
                            <td>${new Date(log.createdAt).toLocaleString()}</td>
                            <td>${log.action.replace(/_/g, ' ')}</td>
                            <td>${log.details || '-'}</td>
                            <td>${log.performedBy}</td>
                            <td>${log.targetStudent || '-'}</td>
                            <td>${log.ip || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;">
            <span style="color:#888;font-size:0.85rem;">Showing ${start + 1}-${Math.min(end, filtered.length)} of ${filtered.length}</span>
            ${paginationHtml}
        </div>
    `;
}

function changeAuditPage(page) {
    const totalPages = Math.ceil(getFilteredAuditLogs().length / auditPerPage);
    if (page < 1 || page > totalPages) return;
    auditPage = page;
    renderAuditLog();
}

function exportAuditLog() {
    const table = document.getElementById('auditLogTable');
    if (!table) return;
    let csv = '';
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
        const cols = row.querySelectorAll('th, td');
        const rowData = [];
        cols.forEach(col => {
            let text = col.textContent.replace(/"/g, '""');
            rowData.push('"' + text + '"');
        });
        csv += rowData.join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function getAuditIcon(action) {
    const icons = { ADMIN_LOGIN: '🔑', CREATE_STUDENT: '👤', UPDATE_PAYMENT: '💰', DELETE_STUDENT: '🗑️', ARCHIVE_STUDENT: '📦' };
    return icons[action] || '📝';
}


// ============================================
// ATTENDANCE MANAGEMENT
// ============================================

let attendanceEditMode = false;

async function loadAttendance() {
    const date = document.getElementById('attendanceDate').value;
    const grade = document.getElementById('attendanceGradeFilter').value;

    if (!date) {
        document.getElementById('attendanceDate').value = new Date().toISOString().split('T')[0];
    }

    const selectedDate = document.getElementById('attendanceDate').value;
    attendanceEditMode = false;
    document.getElementById('btnEditAttendance').style.display = '';
    document.getElementById('btnSaveAttendance').style.display = 'none';
    document.getElementById('btnCancelAttendance').style.display = 'none';

    try {
        const res = await fetch(`${API_URL}/admin/attendance?grade=${encodeURIComponent(grade)}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (!res.ok) return;
        const studentsData = await res.json();

        const body = document.getElementById('attendanceBody');
        if (studentsData.length === 0) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:2rem;">No students found</td></tr>';
            return;
        }

        body.innerHTML = studentsData.map(s => {
            const record = s.attendance.find(a => a.date === selectedDate);
            const currentStatus = record ? record.status : '';
            return `
                <tr>
                    <td>${s.studentNo}</td>
                    <td><strong>${s.fullName}</strong></td>
                    <td>${s.grade}</td>
                    <td>
                        <div class="attendance-btn-group" data-student-id="${s._id}">
                            <button type="button" class="att-btn att-p ${currentStatus === 'P' ? 'active' : ''}" onclick="selectAttendance(this, 'P')" title="Present" disabled>P</button>
                            <button type="button" class="att-btn att-l ${currentStatus === 'L' ? 'active' : ''}" onclick="selectAttendance(this, 'L')" title="Late" disabled>L</button>
                            <button type="button" class="att-btn att-e ${currentStatus === 'E' ? 'active' : ''}" onclick="selectAttendance(this, 'E')" title="Excused" disabled>E</button>
                            <button type="button" class="att-btn att-u ${currentStatus === 'U' ? 'active' : ''}" onclick="selectAttendance(this, 'U')" title="Unexcused" disabled>U</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading attendance:', err);
    }
}

function enableAttendanceEdit() {
    attendanceEditMode = true;
    document.getElementById('btnEditAttendance').style.display = 'none';
    document.getElementById('btnSaveAttendance').style.display = '';
    document.getElementById('btnCancelAttendance').style.display = '';
    document.querySelectorAll('.att-btn').forEach(btn => btn.disabled = false);
}

function cancelAttendanceEdit() {
    loadAttendance();
}

function selectAttendance(btn, status) {
    if (!attendanceEditMode) return;
    const group = btn.parentElement;

    // Toggle off if clicking the same status that's already active
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        group.dataset.selectedStatus = '';
        return;
    }

    group.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    group.dataset.selectedStatus = status;
}

async function saveAllAttendance() {
    const date = document.getElementById('attendanceDate').value;
    if (!date) {
        showToast('Please select a date first');
        return;
    }

    const groups = document.querySelectorAll('.attendance-btn-group');
    const records = [];
    const removals = [];

    groups.forEach(group => {
        const activeBtn = group.querySelector('.att-btn.active');
        const studentId = group.dataset.studentId;
        if (activeBtn) {
            records.push({ studentId, status: activeBtn.textContent.trim() });
        } else {
            // No status selected — remove attendance for this date
            removals.push(studentId);
        }
    });

    try {
        // Save students that have a status selected
        if (records.length > 0) {
            const res = await fetch(`${API_URL}/admin/attendance/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ date, records })
            });

            if (!res.ok) {
                const data = await res.json();
                showToast(data.message || 'Error saving attendance');
                return;
            }
        }

        // Remove attendance for students with no status selected
        for (const studentId of removals) {
            await fetch(`${API_URL}/admin/students/${studentId}/attendance/${date}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
        }

        showToast('Attendance saved successfully');
        loadAttendance();
    } catch (err) {
        showToast('Error saving attendance');
    }
}

// ============================================
// WEBSITE CMS
// ============================================

function loadWebsiteContent() {
    loadWebsiteNews();
    loadWebsiteGallery();
}

function showAddNewsForm() { document.getElementById('addNewsForm').style.display = 'block'; }
function hideAddNewsForm() { document.getElementById('addNewsForm').style.display = 'none'; }
function showAddGalleryForm() { document.getElementById('addGalleryForm').style.display = 'block'; }
function hideAddGalleryForm() { document.getElementById('addGalleryForm').style.display = 'none'; }

async function loadWebsiteNews() {
    const res = await fetch(`${API_URL}/website/admin/news`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const news = await res.json();
    const tbody = document.getElementById('websiteNewsBody');
    if (!tbody) return;

    if (news.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;padding:2rem;">No news yet. Add your first news item.</td></tr>';
        return;
    }

    tbody.innerHTML = news.map(n => `
        <tr>
            <td><img src="${n.imageUrl}" style="width:60px;height:40px;object-fit:cover;border-radius:6px;"></td>
            <td>${n.title}</td>
            <td>${n.date}</td>
            <td><span class="status-${n.published ? 'paid' : 'pending'}">${n.published ? '✓ Published' : '⏸ Draft'}</span></td>
            <td>
                <button class="btn-status btn-mark-${n.published ? 'pending' : 'paid'}" onclick="toggleNewsPublish('${n._id}', ${!n.published})">${n.published ? 'Unpublish' : 'Publish'}</button>
                <button class="btn-status btn-mark-pending" onclick="deleteNews('${n._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function createNews() {
    const title = document.getElementById('newsTitle').value.trim();
    const date = getDatePickerValue('newsDate');
    const description = document.getElementById('newsDescription').value.trim();
    const badge = document.getElementById('newsBadge').value;
    const imageFile = document.getElementById('newsImage').files[0];

    if (!title || !date || !description || !imageFile) {
        showToast('Please fill in all required fields and select an image');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('date', date);
    formData.append('description', description);
    formData.append('badge', badge);
    formData.append('image', imageFile);

    const res = await fetch(`${API_URL}/website/admin/news`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        showToast('News published!');
        hideAddNewsForm();
        document.getElementById('newsTitle').value = '';
        document.getElementById('newsDate').value = '';
        document.getElementById('newsDate').dataset.value = '';
        document.getElementById('newsDescription').value = '';
        document.getElementById('newsImage').value = '';
        loadWebsiteNews();
    } else {
        const data = await res.json();
        showToast(data.message || 'Error creating news');
    }
}

async function toggleNewsPublish(id, published) {
    const formData = new FormData();
    formData.append('published', published);
    const res = await fetch(`${API_URL}/website/admin/news/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });
    if (res.ok) {
        showToast(published ? 'News published' : 'News unpublished');
        loadWebsiteNews();
    }
}

async function deleteNews(id) {
    showConfirmPopup('Delete this news item?', async () => {
        const res = await fetch(`${API_URL}/website/admin/news/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('News deleted');
            loadWebsiteNews();
        }
    });
}

async function loadWebsiteGallery() {
    const res = await fetch(`${API_URL}/website/admin/gallery`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const categories = await res.json();
    const grid = document.getElementById('galleryAdminGrid');
    if (!grid) return;

    // Populate the upload dropdown
    const dropdown = document.getElementById('galleryUploadTarget');
    if (dropdown) {
        dropdown.innerHTML = '<option value="">Select a category...</option>' +
            categories.map(cat => `<option value="${cat._id}">${cat.icon} ${cat.name}</option>`).join('');
    }

    if (categories.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;grid-column:1/-1;">No gallery categories yet.</p>';
        return;
    }

    grid.innerHTML = categories.map(cat => `
        <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid #eee;">
            <div style="height:120px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                ${cat.coverImage ? `<img src="${cat.coverImage}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:3rem;">${cat.icon}</span>`}
            </div>
            <div style="padding:1rem;">
                <h4 style="font-size:0.9rem;margin-bottom:0.3rem;">${cat.icon} ${cat.name}</h4>
                <p style="font-size:0.8rem;color:#888;">${cat.photos.length} photos</p>
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                    <button class="btn-status btn-mark-pending" style="font-size:0.75rem;" onclick="deleteGalleryCategory('${cat._id}')">Delete</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function uploadToSelectedCategory() {
    const categoryId = document.getElementById('galleryUploadTarget').value;
    const files = document.getElementById('galleryUploadFiles').files;

    if (!categoryId) {
        showToast('Please select a category');
        return;
    }
    if (!files || files.length === 0) {
        showToast('Please select photos to upload');
        return;
    }

    const formData = new FormData();
    for (const file of files) {
        formData.append('photos', file);
    }

    showToast('Uploading photos...');
    const res = await fetch(`${API_URL}/website/admin/gallery/${categoryId}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        showToast(`${files.length} photos uploaded!`);
        document.getElementById('galleryUploadFiles').value = '';
        document.getElementById('galleryUploadTarget').value = '';
        loadWebsiteGallery();
    } else {
        showToast('Error uploading photos');
    }
}

async function createGalleryCategory() {
    const name = document.getElementById('galleryCatName').value.trim();
    const icon = document.getElementById('galleryCatIcon').value.trim() || '📸';

    if (!name) {
        showToast('Category name is required');
        return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('icon', icon);

    const res = await fetch(`${API_URL}/website/admin/gallery`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        showToast('Category created!');
        hideAddGalleryForm();
        document.getElementById('galleryCatName').value = '';
        document.getElementById('galleryCatIcon').value = '📸';
        loadWebsiteGallery();
    } else {
        const data = await res.json();
        showToast(data.message || 'Error creating category');
    }
}

async function uploadGalleryPhotos(categoryId, input) {
    if (!input.files || input.files.length === 0) return;

    const formData = new FormData();
    for (const file of input.files) {
        formData.append('photos', file);
    }

    showToast('Uploading photos...');
    const res = await fetch(`${API_URL}/website/admin/gallery/${categoryId}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData
    });

    if (res.ok) {
        const data = await res.json();
        showToast(`${input.files.length} photos uploaded!`);
        loadWebsiteGallery();
    } else {
        showToast('Error uploading photos');
    }
    input.value = '';
}

async function deleteGalleryCategory(id) {
    showConfirmPopup('Delete this gallery category and all its photos?', async () => {
        const res = await fetch(`${API_URL}/website/admin/gallery/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            showToast('Category deleted');
            loadWebsiteGallery();
        }
    });
}

// ============================================
// ROLE-BASED UI
// ============================================

function applyRoleUI() {
    const navBtns = document.querySelectorAll('.admin-nav-btn[data-roles]');
    navBtns.forEach(btn => {
        const roles = btn.getAttribute('data-roles').split(',');
        btn.style.display = roles.includes(adminRole) ? '' : 'none';
    });

    // Show role badge
    const badge = document.getElementById('adminRoleBadge');
    if (badge) {
        const labels = { superadmin: 'Super Admin', admin: 'Admin', staff: 'Staff' };
        badge.textContent = labels[adminRole] || adminRole;
    }

    // Hide delete/archive/payment/discount buttons for staff
    if (adminRole === 'staff') {
        const deleteBtn = document.querySelector('.btn-delete-student');
        if (deleteBtn) deleteBtn.style.display = 'none';
        const archiveBtn = document.getElementById('btnArchiveStudent');
        if (archiveBtn) archiveBtn.style.display = 'none';

        // Hide Add Payment and Add Discount buttons in payment panel
        document.querySelectorAll('.sort-row .btn-add').forEach(btn => {
            if (btn.textContent.includes('Payment') || btn.textContent.includes('Discount')) {
                btn.style.display = 'none';
            }
        });

        // Hide payment/discount forms if open
        const payForm = document.getElementById('addPaymentForm');
        if (payForm) payForm.style.display = 'none';
        const discForm = document.getElementById('addDiscountForm');
        if (discForm) discForm.style.display = 'none';

        // Hide Mark Paid/Pending and Remove buttons in payment table
        document.querySelectorAll('.btn-mark-paid, .btn-mark-pending').forEach(btn => {
            const row = btn.closest('tr');
            if (row && row.closest('#paymentsBody')) btn.style.display = 'none';
        });
    }
}

// ============================================
// STAFF MANAGEMENT (Superadmin only)
// ============================================

function showAddStaffForm() {
    document.getElementById('addStaffForm').style.display = 'block';
}

function hideAddStaffForm() {
    document.getElementById('addStaffForm').style.display = 'none';
    document.getElementById('newStaffName').value = '';
    document.getElementById('newStaffUsername').value = '';
    document.getElementById('newStaffPassword').value = '';
    document.getElementById('newStaffRole').value = 'staff';
}

function toggleStaffPwVisibility() {
    const input = document.getElementById('newStaffPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function createStaffAccount() {
    const name = document.getElementById('newStaffName').value.trim();
    const username = document.getElementById('newStaffUsername').value.trim();
    const password = document.getElementById('newStaffPassword').value;
    const role = document.getElementById('newStaffRole').value;

    if (!name || !username || !password) {
        showToast('Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
    }

    showPasswordPrompt(async (adminPassword) => {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({ name, username, password, role, adminPassword })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(data.message);
            hideAddStaffForm();
            loadStaffList();
        } else {
            showToast(data.message || 'Error creating account');
        }
    });
}

async function loadStaffList() {
    const res = await fetch(`${API_URL}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!res.ok) return;
    const staff = await res.json();
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    tbody.innerHTML = staff.map(s => {
        const roleLabels = { superadmin: 'Super Admin', admin: 'Admin', staff: 'Staff' };
        return `
        <tr>
            <td>${s.name}</td>
            <td>${s.username}</td>
            <td>${roleLabels[s.role] || s.role}</td>
            <td><span class="status-${s.status === 'active' ? 'paid' : 'pending'}">${s.status === 'active' ? '✓ Active' : '⏸ Inactive'}</span></td>
            <td>${new Date(s.createdAt).toLocaleDateString()}</td>
            <td>
                ${s.role === 'superadmin' ? `
                    <button class="btn-status btn-mark-paid" onclick="openStaffDetail('${s._id}')">Edit</button>
                ` : `
                    <button class="btn-status btn-mark-paid" onclick="openStaffDetail('${s._id}')">Edit</button>
                    <button class="btn-status btn-mark-pending" onclick="deleteStaffAccount('${s._id}')">Delete</button>
                `}
            </td>
        </tr>
        `;
    }).join('');
}

function openStaffDetail(id) {
    fetch(`${API_URL}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    }).then(res => res.json()).then(staff => {
        const s = staff.find(x => x._id === id);
        if (!s) return;

        const isSuperAdmin = s.role === 'superadmin';

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-modal" style="max-width:450px;width:90%;text-align:left;">
                <p style="font-size:1.1rem;font-weight:700;text-align:center;margin-bottom:1.2rem;">Edit Account: ${s.name}</p>
                <div style="display:flex;flex-direction:column;gap:0.8rem;">
                    <div>
                        <label style="font-weight:600;font-size:0.85rem;">Full Name</label>
                        <input type="text" id="editStaffName" value="${s.name}" class="password-prompt-input" style="margin-bottom:0;">
                    </div>
                    <div>
                        <label style="font-weight:600;font-size:0.85rem;">Username</label>
                        <input type="text" id="editStaffUsername" value="${s.username}" class="password-prompt-input" style="margin-bottom:0;">
                    </div>
                    <div>
                        <label style="font-weight:600;font-size:0.85rem;">New Password (leave blank to keep current)</label>
                        <input type="password" id="editStaffPassword" placeholder="Enter new password" class="password-prompt-input" style="margin-bottom:0;">
                    </div>
                    ${!isSuperAdmin ? `
                    <div>
                        <label style="font-weight:600;font-size:0.85rem;">Role</label>
                        <select id="editStaffRole" class="password-prompt-input" style="margin-bottom:0;">
                            <option value="staff" ${s.role === 'staff' ? 'selected' : ''}>Staff</option>
                            <option value="admin" ${s.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-weight:600;font-size:0.85rem;">Status</label>
                        <select id="editStaffStatus" class="password-prompt-input" style="margin-bottom:0;">
                            <option value="active" ${s.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="inactive" ${s.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                        </select>
                    </div>
                    ` : `
                    <input type="hidden" id="editStaffRole" value="superadmin">
                    <input type="hidden" id="editStaffStatus" value="active">
                    `}
                </div>
                <div class="confirm-modal-actions" style="margin-top:1.2rem;">
                    <button class="btn-confirm-yes" onclick="saveStaffDetail('${s._id}')">Yes</button>
                    <button class="btn-confirm-no" onclick="this.closest('.confirm-overlay').remove()">No</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    });
}
async function saveStaffDetail(id) {
    const name = document.getElementById('editStaffName').value.trim();
    const username = document.getElementById('editStaffUsername').value.trim();
    const password = document.getElementById('editStaffPassword').value;
    const role = document.getElementById('editStaffRole').value;
    const status = document.getElementById('editStaffStatus').value;

    if (!name || !username) {
        showToast('Name and username are required');
        return;
    }

    // Close the edit modal first
    const editOverlay = document.querySelector('.confirm-overlay');
    if (editOverlay) editOverlay.remove();

    // Ask for superadmin password
    showPasswordPrompt(async (adminPassword) => {
        const body = { name, username, role, status, adminPassword };
        if (password) body.password = password;

        const res = await fetch(`${API_URL}/auth/staff/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            showToast('Account updated');
            loadStaffList();
        } else {
            const data = await res.json();
            showToast(data.message || 'Error updating account');
        }
    });
}

async function updateStaffRole(id, role) {
    // Deprecated - use openStaffDetail instead
}

async function toggleStaffStatus(id, status) {
    // Deprecated - use openStaffDetail instead
}

async function deleteStaffAccount(id) {
    showConfirmPopup('Are you sure you want to delete this account?', () => {
        showPasswordPrompt(async (password) => {
            const res = await fetch(`${API_URL}/auth/staff/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                body: JSON.stringify({ password })
            });
            if (res.ok) {
                showSuccessToast('Account deleted successfully');
                loadStaffList();
            } else {
                const data = await res.json();
                showToast(data.message || 'Error deleting account');
            }
        });
    });
}
