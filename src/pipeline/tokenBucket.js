/**
 * Simple rate limiter: at most `ratePerSec` calls per wall-clock second (spacing).
 */
class TokenBucket {
    /**
     * @param {number} ratePerSec
     */
    constructor(ratePerSec) {
        this.minIntervalMs = Math.max(1, Math.ceil(1000 / Math.max(0.01, ratePerSec)));
        this._nextAt = 0;
    }

    async acquire() {
        const now = Date.now();
        const wait = Math.max(0, this._nextAt - now);
        this._nextAt = Math.max(this._nextAt, now) + this.minIntervalMs;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
}

/**
 * Limits concurrent async work (e.g. Playwright browser contexts).
 */
class ConcurrencySemaphore {
    /**
     * @param {number} max
     */
    constructor(max) {
        this.max = Math.max(1, max);
        this.active = 0;
        /** @type {Array<() => void>} */
        this.waiters = [];
    }

    async acquire() {
        if (this.active < this.max) {
            this.active++;
            return;
        }
        await new Promise((resolve) => {
            this.waiters.push(resolve);
        });
        this.active++;
    }

    release() {
        this.active--;
        const w = this.waiters.shift();
        if (w) w();
    }
}

module.exports = { TokenBucket, ConcurrencySemaphore };
