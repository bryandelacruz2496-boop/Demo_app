// ============================================
// SCHOOL CALENDAR PAGE - Event Data & Rendering
// ============================================

// Month image mapping (aligned with BSIS SCHOOL CALENDAR 2026-2027 folder)
const calendarImages = {
    '2026-5': 'BSIS SCHOOL CALENDAR 2026-2027/June-2026.png',
    '2026-6': 'BSIS SCHOOL CALENDAR 2026-2027/July-2026.png',
    '2026-7': 'BSIS SCHOOL CALENDAR 2026-2027/August-2026.png',
    '2026-8': 'BSIS SCHOOL CALENDAR 2026-2027/September-2026.png',
    '2026-9': 'BSIS SCHOOL CALENDAR 2026-2027/October-2026.png',
    '2026-10': 'BSIS SCHOOL CALENDAR 2026-2027/November-2026.png',
    '2026-11': 'BSIS SCHOOL CALENDAR 2026-2027/December-2026.png',
    '2027-0': 'BSIS SCHOOL CALENDAR 2026-2027/January-2027.png',
    '2027-1': 'BSIS SCHOOL CALENDAR 2026-2027/February-2027.png',
    '2027-2': 'BSIS SCHOOL CALENDAR 2026-2027/March-2027.png',
    '2027-3': 'BSIS SCHOOL CALENDAR 2026-2027/April-2027.png',
    '2027-4': 'BSIS SCHOOL CALENDAR 2026-2027/May-2027.png'
};

// School year events data (June 2026 - May 2027)
// Aligned with BSIS School Calendar 2026-2027
const schoolEvents = {
    '2026-6': [ // June 2026
        { day: 4, text: 'Parents Orientation (Day 1)', type: 'school' },
        { day: 5, text: 'Last day of Enrollment', type: 'school' },
        { day: 5, text: 'Parents Orientation (Day 2)', type: 'school' },
        { day: 12, text: 'Independence Day (No Classes)', type: 'holiday' },
        { day: 15, text: 'Start of Term 1', type: 'school' },
        { day: 15, text: 'Rose Ceremony', type: 'special' }
    ],
    '2026-7': [ // July 2026
        { day: 1, text: 'Main Lesson Block 1 Begins', type: 'school' },
        { day: 17, text: 'Nutrition Month Activity', type: 'special' },
        { day: 24, text: 'Parent-Teacher Conference', type: 'school' },
        { day: 31, text: 'End of Main Lesson Block 1', type: 'school' }
    ],
    '2026-8': [ // August 2026
        { day: 3, text: 'Main Lesson Block 2 Begins', type: 'school' },
        { day: 14, text: 'Book Week Celebration', type: 'special' },
        { day: 21, text: 'Ninoy Aquino Day (No Classes)', type: 'holiday' },
        { day: 26, text: 'National Heroes Day (No Classes)', type: 'holiday' },
        { day: 28, text: 'End of Main Lesson Block 2', type: 'school' }
    ],
    '2026-9': [ // September 2026
        { day: 1, text: 'Main Lesson Block 3 Begins', type: 'school' },
        { day: 11, text: 'Lantern Making Activity', type: 'special' },
        { day: 18, text: 'Michaelmas Festival', type: 'special' },
        { day: 25, text: 'End of Term 1', type: 'school' },
        { day: 28, text: 'Term Break Begins', type: 'holiday' }
    ],
    '2026-10': [ // October 2026
        { day: 2, text: 'Term Break Ends', type: 'holiday' },
        { day: 5, text: 'Start of Term 2', type: 'school' },
        { day: 5, text: 'Main Lesson Block 4 Begins', type: 'school' },
        { day: 16, text: 'World Food Day Activity', type: 'special' },
        { day: 30, text: 'End of Main Lesson Block 4', type: 'school' },
        { day: 31, text: 'Halloween / Harvest Festival', type: 'special' }
    ],
    '2026-11': [ // November 2026
        { day: 1, text: 'All Saints Day (No Classes)', type: 'holiday' },
        { day: 2, text: 'All Souls Day (No Classes)', type: 'holiday' },
        { day: 3, text: 'Main Lesson Block 5 Begins', type: 'school' },
        { day: 20, text: 'Parent-Teacher Conference', type: 'school' },
        { day: 27, text: 'End of Main Lesson Block 5', type: 'school' },
        { day: 30, text: 'Bonifacio Day (No Classes)', type: 'holiday' }
    ],
    '2026-12': [ // December 2026
        { day: 1, text: 'Advent Spiral', type: 'special' },
        { day: 8, text: 'Immaculate Conception (No Classes)', type: 'holiday' },
        { day: 11, text: 'Christmas Program', type: 'special' },
        { day: 12, text: 'End of Term 2', type: 'school' },
        { day: 15, text: 'Christmas Break Begins', type: 'holiday' },
        { day: 25, text: 'Christmas Day', type: 'holiday' },
        { day: 30, text: 'Rizal Day', type: 'holiday' }
    ],
    '2027-1': [ // January 2027
        { day: 1, text: 'New Year\'s Day', type: 'holiday' },
        { day: 4, text: 'Christmas Break Ends', type: 'holiday' },
        { day: 5, text: 'Start of Term 3', type: 'school' },
        { day: 5, text: 'Main Lesson Block 6 Begins', type: 'school' },
        { day: 22, text: 'Three Kings Celebration', type: 'special' },
        { day: 29, text: 'End of Main Lesson Block 6', type: 'school' }
    ],
    '2027-2': [ // February 2027
        { day: 1, text: 'Main Lesson Block 7 Begins', type: 'school' },
        { day: 12, text: 'Valentine\'s Day Activity', type: 'special' },
        { day: 14, text: 'Valentine\'s Day', type: 'special' },
        { day: 25, text: 'EDSA Anniversary (No Classes)', type: 'holiday' },
        { day: 26, text: 'End of Main Lesson Block 7', type: 'school' }
    ],
    '2027-3': [ // March 2027
        { day: 1, text: 'Main Lesson Block 8 Begins', type: 'school' },
        { day: 12, text: 'End of Term 3', type: 'school' },
        { day: 15, text: 'Term Break Begins', type: 'holiday' },
        { day: 19, text: 'Term Break Ends', type: 'holiday' },
        { day: 22, text: 'Start of Term 4', type: 'school' },
        { day: 26, text: 'End of Main Lesson Block 8', type: 'school' }
    ],
    '2027-4': [ // April 2027
        { day: 1, text: 'Holy Week Break Begins', type: 'holiday' },
        { day: 2, text: 'Good Friday', type: 'holiday' },
        { day: 5, text: 'Holy Week Break Ends', type: 'holiday' },
        { day: 6, text: 'Main Lesson Block 9 Begins', type: 'school' },
        { day: 9, text: 'Araw ng Kagitingan (No Classes)', type: 'holiday' },
        { day: 23, text: 'Earth Day Activity', type: 'special' },
        { day: 30, text: 'End of Main Lesson Block 9', type: 'school' }
    ],
    '2027-5': [ // May 2027
        { day: 1, text: 'Labor Day (No Classes)', type: 'holiday' },
        { day: 3, text: 'Main Lesson Block 10 Begins', type: 'school' },
        { day: 14, text: 'Rite of Passage', type: 'special' },
        { day: 21, text: 'End of Term 4', type: 'school' },
        { day: 21, text: 'Last Day of Classes', type: 'school' },
        { day: 26, text: 'Crossing Over Ceremony', type: 'special' },
        { day: 28, text: 'Recognition Day', type: 'special' }
    ]
};

// Calendar state
let calCurrentMonth = 5; // June (0-indexed)
let calCurrentYear = 2026;

const calMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// School year range: June 2026 to May 2027
const calStartMonth = 5, calStartYear = 2026;
const calEndMonth = 4, calEndYear = 2027;

function calGoToMonth(month, year) {
    calCurrentMonth = month;
    calCurrentYear = year;
    renderCalendar();
}

function calPrevMonth() {
    calCurrentMonth--;
    if (calCurrentMonth < 0) {
        calCurrentMonth = 11;
        calCurrentYear--;
    }
    // Clamp to school year range
    if (calCurrentYear < calStartYear || (calCurrentYear === calStartYear && calCurrentMonth < calStartMonth)) {
        calCurrentMonth = calStartMonth;
        calCurrentYear = calStartYear;
    }
    renderCalendar();
}

function calNextMonth() {
    calCurrentMonth++;
    if (calCurrentMonth > 11) {
        calCurrentMonth = 0;
        calCurrentYear++;
    }
    // Clamp to school year range
    if (calCurrentYear > calEndYear || (calCurrentYear === calEndYear && calCurrentMonth > calEndMonth)) {
        calCurrentMonth = calEndMonth;
        calCurrentYear = calEndYear;
    }
    renderCalendar();
}

function updateCalendarImage() {
    const img = document.getElementById('calMonthImage');
    if (!img) return;

    const imageKey = calCurrentYear + '-' + calCurrentMonth;
    const imageSrc = calendarImages[imageKey];

    if (imageSrc) {
        img.classList.add('loading');
        img.src = imageSrc;
        img.alt = calMonthNames[calCurrentMonth] + ' ' + calCurrentYear + ' School Calendar';
        img.onload = () => img.classList.remove('loading');
    }
}

function renderCalendar() {
    // Update image
    updateCalendarImage();

    const grid = document.getElementById('calDaysGrid');
    if (!grid) return;

    const title = document.getElementById('calMonthTitle');
    title.textContent = calMonthNames[calCurrentMonth].toUpperCase() + ', ' + calCurrentYear;

    const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay();
    const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calCurrentYear, calCurrentMonth, 0).getDate();

    // Get events for this month
    const eventKey = calCurrentYear + '-' + (calCurrentMonth + 1);
    const monthEvents = schoolEvents[eventKey] || [];

    let html = '';

    // Previous month trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="cal-day cal-other-month"><span class="cal-day-number">${day}</span></div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dayOfWeek = new Date(calCurrentYear, calCurrentMonth, d).getDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const dayEvents = monthEvents.filter(e => e.day === d);
        const hasEvent = dayEvents.length > 0;

        let classes = 'cal-day';
        if (isSunday) classes += ' cal-sunday';
        if (isSaturday) classes += ' cal-saturday';
        if (hasEvent) classes += ' cal-has-event';

        let eventsHtml = '';
        dayEvents.forEach(ev => {
            eventsHtml += `<div class="cal-event event-type-${ev.type}">• ${ev.text}</div>`;
        });

        html += `<div class="${classes}">
            <span class="cal-day-number">${d}</span>
            ${eventsHtml}
        </div>`;
    }

    // Next month leading days
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="cal-day cal-other-month"><span class="cal-day-number">${i}</span></div>`;
    }

    grid.innerHTML = html;

    // Update nav button states
    const prevBtn = document.getElementById('calPrevBtn');
    const nextBtn = document.getElementById('calNextBtn');
    if (prevBtn) {
        prevBtn.disabled = (calCurrentYear === calStartYear && calCurrentMonth === calStartMonth);
    }
    if (nextBtn) {
        nextBtn.disabled = (calCurrentYear === calEndYear && calCurrentMonth === calEndMonth);
    }
}

// Initialize calendar on page load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calDaysGrid')) {
        renderCalendar();
    }
});
