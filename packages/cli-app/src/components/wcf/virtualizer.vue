<template>
  <div ref="parentRef" class="h-full overflow-y-auto" style="contain: strict;scrollbar-gutter: stable;">
    <div :style="{ height: `${totalSize}px` }" class="relative w-full ">
      <div class="absolute top-0 left-0 w-full" :style="{
        transform: `translateY(${virtualRows[0]?.start ?? 0}px)`,
      }">
        <div v-for="row in virtualRows" :key="row.key + ''" :data-index="row.index" :ref="measureElement">
          <slot :item="data[row.index]" :index="row.index"></slot>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';

interface Isprops {
  data: any[];
}

const parentRef = ref<HTMLElement | null>(null);

const props = withDefaults(defineProps<Isprops>(), {
  data: () => [],
});


const virutalOptions = computed(() => {
  return {
    count: props.data.length,
    getScrollElement: () => parentRef.value,
    estimateSize: () => 60,
  };
});



const rowVirtualizer = useVirtualizer(virutalOptions);

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems());

const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

const measureElement = (el: Element) => {
  if (!el) {
    return;
  }
  rowVirtualizer.value.measureElement(el);

  return undefined;
};
const scrollToIndex = (index: number) => {
  rowVirtualizer.value.scrollToIndex(index);
};

const scrollBottom = () => {
  parentRef.value?.scrollTo({
    top: parentRef.value.scrollHeight,
    behavior: 'smooth',
  });
};

watch(
  () => props.data,
  () => {
    props.data
  },
);

defineExpose({
  scrollToIndex,
  scrollBottom,
});
</script>
