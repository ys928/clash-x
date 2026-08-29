<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'default' | 'error'
  }>(),
  {
    tone: 'default',
  },
)
</script>

<template>
  <div
    class="ui-status"
    :class="{ 'ui-status--error': tone === 'error' }"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.ui-status {
  padding: 28px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;

  &--error {
    color: #c62828;
  }
}
</style>
