import { isEqual } from 'lodash-es';

const c1 = { id: "c1", description: "test", loadA: 5.01, linkedSubPanelId: undefined };
const c2 = { id: "c1", description: "test", loadA: 5.01, linkedSubPanelId: undefined };

console.log(isEqual(c1, c2));
