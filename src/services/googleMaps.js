/**
 * Google Places API (Text Search): search by keyword + location → business listings.
 * Uses legacy endpoint: maps/api/place/textsearch/json
 * Requires a Google API key with Places API enabled.
 */

const axios = require('axios');

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

/**
 * Extract UK postcode from formatted_address (best-effort).
 * @param {string} address
 * @returns {string|null}
 */
function extractUkPostcode(address) {
    if (!address || typeof address !== 'string') return null;
    const match = address.match(/\b([A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2})\b/i);
    return match ? match[1].trim() : null;
}

/**
 * Search for places by keyword and location; returns array in lead shape.
 * @param {{ apiKey: string, keyword: string, location: string, limit?: number }} opts
 * @returns {Promise<Array<{ name: string, number: string, address: string, postcode: string | null }>>}
 */
async function searchPlaces({ apiKey, keyword, location, limit = 20 }) {
    if (!apiKey || !apiKey.trim()) {
        throw new Error('Google Maps/Places API key is required. Set GOOGLE_PLACES_API_KEY in .env or in Profile.');
    }
    const query = [keyword, location].filter(Boolean).join(' in ');
    if (!query.trim()) {
        throw new Error('Keyword and location are required for Google Maps search.');
    }

    const params = new URLSearchParams({
        query: query.trim(),
        key: apiKey.trim()
    });

    const response = await axios.get(`${TEXT_SEARCH_URL}?${params.toString()}`, {
        timeout: 15000,
        headers: { 'Accept': 'application/json' }
    });

    const data = response.data;
    if (data.status === 'REQUEST_DENIED') {
        throw new Error(data.error_message || 'Places API request denied. Check API key and enable Places API.');
    }
    if (data.status === 'ZERO_RESULTS') {
        return [];
    }
    if (data.status !== 'OK' && data.status !== 'OVER_QUERY_LIMIT') {
        throw new Error(data.error_message || `Places API error: ${data.status}`);
    }

    const results = data.results || [];
    const out = [];
    const max = Math.min(limit || 20, results.length);

    for (let i = 0; i < max; i++) {
        const place = results[i];
        const name = place.name || 'Unknown';
        const formattedAddress = place.formatted_address || '';
        const postcode = extractUkPostcode(formattedAddress);

        out.push({
            name,
            number: place.place_id ? `gmaps_${place.place_id}` : `gmaps_${i}_${Date.now()}`,
            address: formattedAddress,
            postcode: postcode || null,
            source_metadata: place
        });
    }

    return out;
}

module.exports = {
    searchPlaces,
    extractUkPostcode
};
