<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string
    tone?: 'default' | 'proxy' | 'direct'
  }>(),
  {
    tone: 'default',
  },
)
</script>

<template>
  <div
    class="ui-stat-card"
    :class="{
      'ui-stat-card--proxy': tone === 'proxy',
      'ui-stat-card--direct': tone === 'direct',
    }"
  >
    <div class="ui-stat-card__label">{{ label }}</div>
    <div class="ui-stat-card__value">{{ value }}</div>
  </div>
</template>

<style scoped lang="scss">
.ui-stat-card {
  padding: 12px 14px;
  border-radius: var(--cx-radius-md, 8px);
  background: var(--background-paper);
  border: 1px solid var(--cx-divider, var(--divider-color));

  &__label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  &__value {
    margin-top: 6px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  &--proxy .ui-stat-card__value {
    color: var(--primary-main);
  }

  &--direct .ui-stat-card__value {
    color: #2e7d32;
  }
}
</style>
