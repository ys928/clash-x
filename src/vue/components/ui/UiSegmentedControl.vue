<script setup lang="ts" generic="T extends string">
defineProps<{
  options: Array<{ value: T; label: string }>
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="ui-segmented" role="tablist">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      class="ui-segmented__item"
      :class="{ 'is-active': model === option.value }"
      :aria-selected="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.ui-segmented {
  display: inline-flex;
  padding: 3px;
  border-radius: var(--cx-radius-md, 8px);
  background: var(--background-paper);
  border: 1px solid var(--cx-divider, var(--divider-color));

  &__item {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: var(--cx-radius-sm, 6px);
    cursor: pointer;

    &.is-active {
      background: var(--background-color-alpha);
      color: var(--primary-main);
    }
  }
}
</style>
