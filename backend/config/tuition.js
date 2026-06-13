// Tuition and Payment Schemes

const TUITION_TABLE = {
    old: {
        'Palaruan 1': { tuition: 13000, miscTotal: 6000, grandTotal: 19000 },
        'Palaruan 2': { tuition: 13000, miscTotal: 6000, grandTotal: 19000 },
        'Kindergarten': { tuition: 13000, miscTotal: 7000, grandTotal: 20000 },
        'Grade 1': { tuition: 16500, miscTotal: 6000, grandTotal: 22500 },
        'Grade 2': { tuition: 16500, miscTotal: 6000, grandTotal: 22500 },
        'Grade 3': { tuition: 16500, miscTotal: 6000, grandTotal: 22500 },
        'Grade 4': { tuition: 16500, miscTotal: 6000, grandTotal: 22500 },
        'Grade 5': { tuition: 16500, miscTotal: 6000, grandTotal: 22500 },
        'Grade 6': { tuition: 16000, miscTotal: 7500, grandTotal: 23500 }
    },
    new: {
        'Palaruan 1': { tuition: 15000, miscTotal: 6000, grandTotal: 21000 },
        'Palaruan 2': { tuition: 15000, miscTotal: 6000, grandTotal: 21000 },
        'Kindergarten': { tuition: 16000, miscTotal: 7000, grandTotal: 23000 },
        'Grade 1': { tuition: 18000, miscTotal: 6500, grandTotal: 24500 },
        'Grade 2': { tuition: 18000, miscTotal: 6500, grandTotal: 24500 },
        'Grade 3': { tuition: 18000, miscTotal: 6500, grandTotal: 24500 },
        'Grade 4': { tuition: 18000, miscTotal: 6500, grandTotal: 24500 },
        'Grade 5': { tuition: 18000, miscTotal: 6500, grandTotal: 24500 },
        'Grade 6': { tuition: 20000, miscTotal: 7500, grandTotal: 27500 }
    }
};

// Monthly schedules (7 months: June-December)
const MONTHLY_SCHEDULES = {
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

function generatePayments(grade, paymentOption, enrolleeType) {
    const type = enrolleeType || 'old';
    const table = TUITION_TABLE[type];
    const gradeData = table ? table[grade] : null;
    if (!gradeData) return { payments: [], totalTuition: 0 };

    const tuition = gradeData.tuition;
    const miscTotal = gradeData.miscTotal;
    let payments = [];

    if (paymentOption === 'full') {
        const discountedTuition = Math.round(tuition * 0.97);
        const totalPayment = discountedTuition + miscTotal;

        payments.push({
            date: '2026-06-01',
            description: `Full Payment (3% discount) - Tuition: ₱${discountedTuition.toLocaleString()} + Misc: ₱${miscTotal.toLocaleString()}`,
            amount: totalPayment,
            originalAmount: totalPayment,
            status: 'pending'
        });

        return { payments, totalTuition: totalPayment };

    } else if (paymentOption === 'two_payments') {
        const withInterest = Math.round(tuition * 1.05);
        const totalPayment = withInterest + miscTotal;
        const halfPayment = Math.round(totalPayment / 2);

        payments.push({
            date: '2026-06-01',
            description: 'First Payment (Upon Enrollment)',
            amount: halfPayment,
            originalAmount: halfPayment,
            status: 'pending'
        });
        payments.push({
            date: '2026-12-01',
            description: 'Second Payment (December 2026)',
            amount: halfPayment,
            originalAmount: halfPayment,
            status: 'pending'
        });

        return { payments, totalTuition: totalPayment };

    } else {
        // Monthly (7 months: June-December)
        const schedules = MONTHLY_SCHEDULES[type];
        const monthlySchedule = schedules ? schedules[grade] : [0, 0, 0, 0, 0, 0, 0];

        const months = [
            { month: '06', name: 'June 2026' },
            { month: '07', name: 'July 2026' },
            { month: '08', name: 'August 2026' },
            { month: '09', name: 'September 2026' },
            { month: '10', name: 'October 2026' },
            { month: '11', name: 'November 2026' },
            { month: '12', name: 'December 2026' }
        ];

        for (let i = 0; i < 7; i++) {
            payments.push({
                date: `2026-${months[i].month}-01`,
                description: `Monthly Payment - ${months[i].name}`,
                amount: monthlySchedule[i],
                originalAmount: monthlySchedule[i],
                status: 'pending'
            });
        }

        return { payments, totalTuition: monthlySchedule.reduce((a, b) => a + b, 0) };
    }
}

module.exports = { TUITION_TABLE, MONTHLY_SCHEDULES, generatePayments };
