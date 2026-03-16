/**
 * ESLint flat config for backend (src/, scripts/).
 * UI has its own eslint.config.js in ui/.
 */

module.exports = [
    {
        files: ['src/**/*.js', 'scripts/**/*.js'],
        ignores: ['node_modules/**', 'ui/**', 'dist/**'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                console: 'readonly',
                process: 'readonly',
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'warn'
        }
    }
];
