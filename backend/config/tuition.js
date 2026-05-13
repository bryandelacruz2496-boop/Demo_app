// Tuition and Payment Schemes for Old Enrollees

const TUITION_TABLE = {
    'Palaruan': {
        tuition: 13000,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 19000
    },
    'Kindergarten': {
        tuition: 13000,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200,
            crossingOver: 1000
        },
        miscTotal: 7000,
        grandTotal: 20000
    },
    'Grade 1': {
        tuition: 16500,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 22500
    },
    'Grade 2': {
        tuition: 16500,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 22500
    },
    'Grade 3': {
        tuition: 16500,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 22500
    },
    'Grade 4': {
        tuition: 16500,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 22500
    },
    'Grade 5': {
        tuition: 16500,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2000,
            upeiq: 200
        },
        miscTotal: 6000,
        grandTotal: 22500
    },
    'Grade 6': {
        tuition: 16000,
        miscellaneous: {
            admission: 300,
            developmentalFees: 500,
            facilities: 3000,
            utilities: 2500,
            upeiq: 200,
            crossingOver: 1000
        },
        miscTotal: 7500,
        grandTotal: 23500
    }
};

// Payment Schemes
function generatePayments(grade, paymentOption) {
    const gradeData = TUITION_TABLE[grade];
    if (!gradeData) return { payments: [], totalTuition: 0 };

    const tuition = gradeData.tuition;
    const miscTotal = gradeData.miscTotal;
    const grandTotal = gradeData.grandTotal;
    let payments = [];

    if (paymentOption === 'full') {
        // Option 1: Full Payment - 3% discount on tuition
        const discountedTuition = Math.round(tuition * 0.97);
        const totalPayment = discountedTuition + miscTotal;

        payments.push({
            date: '2026-06-01',
            description: `Full Payment (3% discount) - Tuition: ₱${discountedTuition.toLocaleString()} + Misc: ₱${miscTotal.toLocaleString()}`,
            amount: totalPayment,
            status: 'pending'
        });

        return { payments, totalTuition: totalPayment };

    } else if (paymentOption === 'two_payments') {
        // Option 2: Two Equal Payments - 5% interest on tuition
        const withInterest = Math.round(tuition * 1.05);
        const totalPayment = withInterest + miscTotal;
        const halfPayment = Math.round(totalPayment / 2 * 100) / 100;

        payments.push({
            date: '2026-06-01',
            description: 'First Payment (Upon Enrollment)',
            amount: halfPayment,
            status: 'pending'
        });
        payments.push({
            date: '2026-12-01',
            description: 'Second Payment (December 2026)',
            amount: halfPayment,
            status: 'pending'
        });

        return { payments, totalTuition: totalPayment };

    } else {
        // Option 3: Monthly (6 months) - 7% interest on tuition
        const withInterest = Math.round(tuition * 1.07);
        const totalPayment = withInterest + miscTotal;

        // First month includes miscellaneous
        const firstPayment = miscTotal;
        const remainingTotal = withInterest;
        const monthlyAmount = Math.round(remainingTotal / 6);

        const months = [
            { month: '06', name: 'June 2026' },
            { month: '07', name: 'July 2026' },
            { month: '08', name: 'August 2026' },
            { month: '09', name: 'September 2026' },
            { month: '10', name: 'October 2026' },
            { month: '11', name: 'November 2026' },
            { month: '12', name: 'December 2026' }
        ];

        // Use the exact amounts from the table
        const monthlySchedule = getMonthlySchedule(grade);

        for (let i = 0; i < 7; i++) {
            payments.push({
                date: `2026-${months[i].month}-01`,
                description: `Monthly Payment - ${months[i].name}`,
                amount: monthlySchedule[i],
                status: 'pending'
            });
        }

        return { payments, totalTuition: monthlySchedule.reduce((a, b) => a + b, 0) };
    }
}

// Exact monthly amounts from the table
function getMonthlySchedule(grade) {
    const schedules = {
        'Palaruan': [3000, 2818, 2818, 2818, 2818, 2818, 2818],
        'Kindergarten': [3000, 2985, 2985, 2985, 2985, 2985, 2985],
        'Grade 1': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 2': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 3': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 4': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 5': [3000, 3442, 3442, 3442, 3442, 3442, 3442],
        'Grade 6': [3000, 3603, 3603, 3603, 3603, 3603, 3603]
    };
    return schedules[grade] || [0, 0, 0, 0, 0, 0, 0];
}

module.exports = { TUITION_TABLE, generatePayments };
