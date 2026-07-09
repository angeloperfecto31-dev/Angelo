import fs from 'fs';
const file = fs.readFileSync('src/utils/hierarchyEngine.ts', 'utf8');
console.log(file.split('\n').filter(l => l.includes('console.log')).join('\n'));
