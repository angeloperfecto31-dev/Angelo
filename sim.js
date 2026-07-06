const STANDARD_CB_RATINGS = [15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 125, 150, 160, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 1200, 1600, 2000, 2500, 3200, 4000, 5000];
const baseAmp = 16.7;
const designAmp = 20.87;
let calculatedCb = STANDARD_CB_RATINGS.find(r => r * 0.8 >= baseAmp && r >= Math.max(designAmp, baseAmp)) || 100;
let cb = calculatedCb;
while (cb * 0.8 < baseAmp) {
  cb = STANDARD_CB_RATINGS.find(r => r > cb);
}
console.log("Breaker:", cb);
