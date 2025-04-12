<template>
  <n-config-provider :theme-overrides="themeOverrides">
    <n-notification-provider :max="1" placement="bottom-right">
      <n-message-provider>
        <wcf></wcf>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>
<script setup lang="ts">
import wcf from './components/wcf/wcf.vue';
import { GlobalThemeOverrides } from 'naive-ui';
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#374153',
  },
  Input: {
    borderFocus: '#374153',
    borderHover: '#374153',
  },
};
</script>
