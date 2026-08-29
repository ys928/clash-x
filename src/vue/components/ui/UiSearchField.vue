<script setup lang="ts">
withDefaults(
  defineProps<{
    placeholder?: string
  }>(),
  {
    placeholder: '',
  },
)

const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    class="ui-search"
    type="search"
    :placeholder="placeholder"
  />
</template>

<style scoped lang="scss">
.ui-search {
  height: 32px;
  min-width: 180px;
  padding: 0 10px;
  border-radius: var(--cx-radius-sm, 6px);
  border: 1px solid var(--cx-divider, var(--divider-color));
  background: var(--background-paper);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: var(--primary-main);
  }
}
</style>
