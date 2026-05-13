const fs = require('fs');
const file = 'c:\\Users\\Bryan\\Demo_app\\admin.html';
let content = fs.readFileSync(file, 'utf8');
// Fix the broken backtick-n replacements
content = content.replace(/value="Palaruan 1">Palaruan 1<\/option>`n\s*<option value="Palaruan 2">Palaruan 2<\/option>/g,
    'value="Palaruan 1">Palaruan 1</option>\n                                <option value="Palaruan 2">Palaruan 2</option>');
fs.writeFileSync(file, content);
console.log('Fixed admin.html');
