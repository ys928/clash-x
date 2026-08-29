<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: 'default' | 'danger'
    disabled?: boolean
  }>(),
  {
    type: 'button',
    variant: 'default',
    disabled: false,
  },
)
</script>

<template>
  <button
    :type="type"
    class="ui-btn"
    :class="{ 'ui-btn--danger': variant === 'danger' }"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
.ui-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--cx-radius-sm, 6px);
  border: 1px solid var(--cx-divider, var(--divider-color));
  background: var(--background-paper);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }

  &--danger {
    color: #c62828;
    border-color: color-mix(in srgb, #c62828 35%, transparent);
  }
}
</style>
