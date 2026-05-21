import { exportToWord } from './src/utils/exportWord';
import { INITIAL_PANEL, INITIAL_CIRCUITS } from './src/components/LoadSchedule';
import { INITIAL_VOLTAGE_DROP_CALCULATIONS } from './src/constants';

global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.Image = class {
  _src = '';
  width = 100;
  height = 100;
  onload: any = () => {};
  onerror: any = () => {};
  set src(val: string) {
    this._src = val;
    setTimeout(() => this.onload(), 10);
  }
  get src() { return this._src; }
} as any;

import fileSaver from 'file-saver';
(fileSaver as any).saveAs = () => {};

(async () => {
    try {
        await exportToWord(
            INITIAL_PANEL, 
            INITIAL_CIRCUITS, 
            [], 
            INITIAL_VOLTAGE_DROP_CALCULATIONS, 
            {
               sld: {'MDP': 'data:image/png;base64,iVBORw0K'},
               isc: null,
               vdDiagrams: {},
               illumination: null
            }
        );
        console.log('SUCCESS');
    } catch (e) {
        console.error('FAIL', e);
    }
})();
