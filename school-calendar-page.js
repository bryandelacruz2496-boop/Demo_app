// ============================================
// SCHOOL CALENDAR PAGE - Event Data & Rendering
// ============================================

// School year events data (June 2026 - May 2027)
// Aligned with BSIS School Calendar 2026-2027
const schoolEvents = {
    '2026-6': [ // June 2026
        { day: 15, text: 'Start of Term 1', type: 'school' },
        { day: 15, text: 'Rose Ceremony', type: 'special' }
    ],
    '2026-7': [ // July 2026
        { day: 6, text: 'Pajama Day', type: 'special' },
        { day: 10, text: 'Class 2&3 Field Learning: LGU', type: 'school' }
    ],
    '2026-8': [ // August 2026
        { day: 3, text: 'Araw ng Filipiñana at Barong', type: 'special' },
        { day: 10, text: 'Araw ng Filipiñana at Barong', type: 'special' },
        { day: 17, text: 'Araw ng Filipiñana at Barong', type: 'special' },
        { day: 24, text: 'Araw ng Filipiñana at Barong', type: 'special' },
        { day: 26, text: 'Class 1 Field Learning: Animals', type: 'school' },
        { day: 28, text: 'Palarong Pinoy', type: 'special' },
        { day: 31, text: 'Boodle Fight', type: 'special' }
    ],
    '2026-9': [ // September 2026
        { day: 2, text: 'Class 2&3 Field Learning: Plants', type: 'school' },
        { day: 9, text: 'End of Term 1', type: 'school' },
        { day: 10, text: 'End of Term 1', type: 'school' },
        { day: 11, text: 'End of Term 1', type: 'school' },
        { day: 12, text: 'Parent\'s Night', type: 'special' },
        { day: 14, text: 'Term 1 End of Term', type: 'school' },
        { day: 15, text: 'Bahaginan', type: 'special' },
        { day: 16, text: 'PTA Meeting', type: 'school' },
        { day: 16, text: 'Card Distribution', type: 'school' },
        { day: 17, text: 'Health Break (Students)', type: 'holiday' },
        { day: 18, text: 'Health Break (Students)', type: 'holiday' },
        { day: 19, text: 'Health Break (Students & Faculty)', type: 'holiday' },
        { day: 20, text: 'Health Break (Students & Faculty)', type: 'holiday' },
        { day: 21, text: 'Health Break (Students & Faculty)', type: 'holiday' },
        { day: 22, text: 'Health Break (Students & Faculty)', type: 'holiday' },
        { day: 23, text: 'Start of Term 2', type: 'school' },
        { day: 24, text: 'Class 1 Field Learning: Poblacion', type: 'school' }
    ],
    '2026-10': [ // October 2026 - No events
    ],
    '2026-11': [ // November 2026
        { day: 14, text: 'Halloween Fair', type: 'special' },
        { day: 17, text: 'Stuffed Toy Day', type: 'special' }
    ],
    '2026-12': [ // December 2026
        { day: 15, text: 'End of Term 2', type: 'school' },
        { day: 16, text: 'Bahaginan', type: 'special' },
        { day: 17, text: 'PTA Meeting', type: 'school' },
        { day: 17, text: 'Card Distribution', type: 'school' },
        { day: 18, text: 'Year End Party', type: 'special' },
        { day: 19, text: 'Faculty & Staff Christmas Party', type: 'special' }
    ],
    '2027-1': [ // January 2027
        { day: 4, text: 'Start of Term 3', type: 'school' },
        { day: 13, text: 'Class Color Day', type: 'special' },
        { day: 25, text: 'Graduation Shoot (Class 6)', type: 'special' },
        { day: 26, text: 'Start of Early Registration', type: 'school' },
        { day: 29, text: 'Grandparents Day', type: 'special' }
    ],
    '2027-2': [ // February 2027
        { day: 13, text: 'Family Day', type: 'special' },
        { day: 18, text: 'Hidden Treasures Day', type: 'special' }
    ],
    '2027-3': [ // March 2027
        { day: 1, text: 'Special No Classes Day', type: 'holiday' },
        { day: 19, text: 'Sunny Summer Day', type: 'special' },
        { day: 29, text: 'End of Term 3', type: 'school' },
        { day: 29, text: 'Fire Prevention Celebration', type: 'special' },
        { day: 30, text: 'End of Term Class Meetings', type: 'school' },
        { day: 31, text: 'End of Term Class Meetings', type: 'school' }
    ],
    '2027-4': [ // April 2027
        { day: 1, text: 'End of Term 3', type: 'school' },
        { day: 2, text: 'End of Term 3', type: 'school' },
        { day: 5, text: 'End of Term 3', type: 'school' },
        { day: 6, text: 'End of Term 3', type: 'school' },
        { day: 7, text: 'End of Term 3', type: 'school' },
        { day: 8, text: 'End of Term 3', type: 'school' },
        { day: 9, text: 'Bahaginan', type: 'special' },
        { day: 9, text: 'Card Distribution', type: 'school' },
        { day: 12, text: 'General Rehearsals', type: 'school' },
        { day: 13, text: 'Recognition Day', type: 'special' },
        { day: 14, text: 'Crossing Over', type: 'special' },
        { day: 14, text: 'Rite of Passage', type: 'special' },
        { day: 15, text: 'Start of Faculty Summer Break', type: 'holiday' }
    ],
    '2027-5': [ // May 2027
        { day: 3, text: 'Opening of Office for SY:2027-2028', type: 'school' },
        { day: 4, text: 'End of Early Registration', type: 'school' }
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

function renderCalendar() {
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
