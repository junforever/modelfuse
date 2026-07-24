module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Restringir los tipos de commits a feat y fix únicamente
    'type-enum': [2, 'always', ['feat', 'fix']],
  },
};
