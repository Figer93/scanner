/**
 * Profile key-value storage for API keys and settings.
 */

async function getProfile(db) {
    const rows = await db.query('SELECT key, value FROM profile');
    const out = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
}

async function setProfileKey(db, key, value) {
    await db.run(
        'INSERT INTO profile (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value == null ? '' : String(value)]
    );
}

async function deleteProfileKey(db, key) {
    await db.run('DELETE FROM profile WHERE key = $1', [key]);
}

module.exports = {
    getProfile,
    setProfileKey,
    deleteProfileKey,
};
