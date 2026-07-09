import fs from 'fs';
let content = fs.readFileSync('src/components/LoadSchedule.tsx', 'utf8');

if (!content.includes('getValidPolesForSystem')) {
  content = content.replace(
    /import {([^}]+)} from "\.\.\/utils\/computeEngine";/g,
    'import {$1, getValidPolesForSystem} from "../utils/computeEngine";'
  );
}

const oldSelect = `                          onChange={(e) =>
                            updateCircuit(c.id, {
                              mcbP: parseInt(e.target.value),
                            })
                          }
                          className={\`bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none w-12 max-w-full mx-auto dark:bg-slate-900 \${c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? "text-slate-400 dark:text-slate-500" : ""}\`}
                        >
                          {[1, 2, 3, 4].map((p) => (
                            <option
                              key={p}
                              value={p}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {p}P
                            </option>
                          ))}
                        </select>`;

const newSelect = `                          onChange={(e) =>
                            updateCircuit(c.id, {
                              mcbP: e.target.value,
                            })
                          }
                          className={\`bg-transparent text-center text-slate-800 dark:text-slate-100 appearance-none w-16 max-w-full mx-auto dark:bg-slate-900 \${c.loadType === LoadType.SUB_PANEL || c.loadType === LoadType.SUB_SUB_PANEL ? "text-slate-400 dark:text-slate-500" : ""}\`}
                        >
                          {getValidPolesForSystem(panel.system).map((p) => (
                            <option
                              key={p}
                              value={p}
                              className="dark:bg-slate-900 dark:text-slate-100"
                            >
                              {p}
                            </option>
                          ))}
                        </select>`;

content = content.replace(oldSelect, newSelect);
fs.writeFileSync('src/components/LoadSchedule.tsx', content, 'utf8');
console.log("LoadSchedule.tsx patched");
