import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'app',
  ignores: [
    '**/dist/**',
    'auto-imports.d.ts',
    'components.d.ts',
  ],
  typescript: true,
  unocss: true,
  vue: true,
  formatters: {
    css: true,
    html: true,
    markdown: true,
  },
})
