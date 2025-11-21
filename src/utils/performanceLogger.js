export class PerformanceLogger {
  constructor(effectName) {
    this.effectName = effectName;
    this.startTime = performance.now();
    console.log(`[${this.effectName}] ⏱️  STARTED at ${this.startTime.toFixed(2)}ms`);
  }

  phase(name) {
    const now = performance.now();
    const elapsed = now - this.startTime;
    console.log(`[${this.effectName}] 📍 ${name} (+${elapsed.toFixed(2)}ms)`);
    return now;
  }

  frame(phaseNum, frameNum, charCount, updateTime) {
    if (frameNum === 0) {
      console.log(`[${this.effectName}] ├─ Phase ${phaseNum} Frame 0: UPDATE=${updateTime.toFixed(2)}ms | CHARS=${charCount}`);
    }
  }

  spread(operation, charCount, time) {
    console.log(`[${this.effectName}] 🔄 [...spread] [${operation}]: ${charCount} chars = ${time.toFixed(2)}ms`);
  }

  summary(totalTime) {
    console.log(`[${this.effectName}] ✅ COMPLETE: ${totalTime.toFixed(2)}ms TOTAL\n`);
  }

  error(msg) {
    console.error(`[${this.effectName}] ❌ ${msg}`);
  }
}
