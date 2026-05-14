(function () {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let currentPicker = null;
    let pickerMonth, pickerYear, pickerInput;

    function createPicker(input) {
        closePicker();
        pickerInput = input;

        // Parse existing value or use today
        let date = new Date();
        if (input.dataset.value) {
            date = new Date(input.dataset.value);
        }
        pickerMonth = date.getMonth();
        pickerYear = date.getFullYear();

        const picker = document.createElement('div');
        picker.className = 'custom-datepicker';
        picker.innerHTML = renderCalendar();
        document.body.appendChild(picker);

        // Position near input
        const rect = input.getBoundingClientRect();
        picker.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        picker.style.left = (rect.left + window.scrollX) + 'px';

        currentPicker = picker;
        attachPickerEvents();
    }

    function renderCalendar() {
        const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
        const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
        const today = new Date();
        const selectedDate = pickerInput.dataset.value || '';

        let html = `
            <div class="dp-header">
                <button class="dp-nav" id="dpPrev">&#10094;</button>
                <span class="dp-title">${MONTHS[pickerMonth]} ${pickerYear}</span>
                <button class="dp-nav" id="dpNext">&#10095;</button>
            </div>
            <div class="dp-days-header">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
            </div>
            <div class="dp-days">
        `;

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            html += '<span class="dp-day dp-empty"></span>';
        }

        // Day cells
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = (d === today.getDate() && pickerMonth === today.getMonth() && pickerYear === today.getFullYear());
            const isSelected = dateStr === selectedDate;
            let cls = 'dp-day';
            if (isToday) cls += ' dp-today';
            if (isSelected) cls += ' dp-selected';
            html += `<span class="${cls}" data-date="${dateStr}">${d}</span>`;
        }

        html += '</div>';
        return html;
    }

    function attachPickerEvents() {
        if (!currentPicker) return;

        currentPicker.querySelector('#dpPrev').onclick = (e) => {
            e.stopPropagation();
            pickerMonth--;
            if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
            currentPicker.innerHTML = renderCalendar();
            attachPickerEvents();
        };

        currentPicker.querySelector('#dpNext').onclick = (e) => {
            e.stopPropagation();
            pickerMonth++;
            if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
            currentPicker.innerHTML = renderCalendar();
            attachPickerEvents();
        };

        currentPicker.querySelectorAll('.dp-day:not(.dp-empty)').forEach(day => {
            day.onclick = (e) => {
                e.stopPropagation();
                const dateStr = day.dataset.date;
                pickerInput.value = formatDisplay(dateStr);
                pickerInput.dataset.value = dateStr;
                closePicker();
            };
        });
    }

    function formatDisplay(dateStr) {
        const [y, m, d] = dateStr.split('-');
        return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
    }

    function closePicker() {
        if (currentPicker) {
            currentPicker.remove();
            currentPicker = null;
        }
    }

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (currentPicker && !currentPicker.contains(e.target) && !e.target.classList.contains('datepicker-input')) {
            closePicker();
        }
    });

    // Attach to all datepicker inputs
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('datepicker-input')) {
            createPicker(e.target);
        }
    });

    // Helper to get ISO date value from a datepicker input
    window.getDatePickerValue = function (id) {
        const el = document.getElementById(id);
        return el ? (el.dataset.value || '') : '';
    };

    // Helper to set a datepicker input value
    window.setDatePickerValue = function (id, dateStr) {
        const el = document.getElementById(id);
        if (!el || !dateStr) return;
        el.dataset.value = dateStr;
        el.value = formatDisplay(dateStr);
    };
})();
