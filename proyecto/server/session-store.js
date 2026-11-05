const session = require('express-session');
const { db } = require('./db');

class SQLiteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.cleanupIntervalMs = options.cleanupIntervalMs || 15 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      const row = db.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expired_at < now) {
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      const data = JSON.parse(row.sess);
      return callback(null, data);
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + maxAge;
      const sessJson = JSON.stringify(sess);
      const userId = sess.user && sess.user.id ? sess.user.id : null;

      const existing = db.prepare('SELECT sid FROM sessions WHERE sid = ?').get(sid);
      if (existing) {
        db.prepare('UPDATE sessions SET sess = ?, user_id = ?, expired_at = ? WHERE sid = ?').run(sessJson, userId, expiredAt, sid);
      } else {
        db.prepare('INSERT INTO sessions (sid, user_id, sess, expired_at) VALUES (?, ?, ?, ?)').run(sid, userId, sessJson, expiredAt);
      }
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  static revokeUserSessions(userId) {
    try {
      if (userId) {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      }
    } catch (_) {}
  }

  destroy(sid, callback) {
    try {
      db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + maxAge;
      db.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?').run(expiredAt, sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  cleanup() {
    try {
      const now = Date.now();
      db.prepare('DELETE FROM sessions WHERE expired_at < ?').run(now);
    } catch (_) {}
  }
}

module.exports = SQLiteSessionStore;
