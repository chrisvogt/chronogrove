import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Fork per file so global env (NODE_ENV) cannot leak across parallel suites.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '__tests__/',
        'jobs/test-support/',
        'app/test-support/',
        'coverage/',
        '*.config.js',
        'scripts/**/*.cjs',
        'lib/**',
        'api/cloud-storage/list-stored-media.ts'
      ],
      thresholds: {
        lines: 99,
        statements: 99,
        functions: 99,
        branches: 94
      }
    },
    include: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
    exclude: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**'
    ],
    reporters: [
      'default',
      ['junit', { outputFile: 'coverage/junit.xml' }]
    ]
  }
}) 