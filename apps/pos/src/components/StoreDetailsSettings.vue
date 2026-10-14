<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  ADDRESS_MAX_LENGTH,
  CONTACT_MAX_ENTRIES,
  CONTACT_MAX_LENGTH,
  formatSocialLink,
  SOCIAL_PLATFORMS,
  useStoreDetails,
  type ContactAddError,
  type ContactList,
  type SocialPlatform,
} from "../composables/useStoreDetails";

const { t } = useI18n({ useScope: "global" });
const store = useStoreDetails();

// Saved on blur (the textarea's change event) like the store name, not per
// keystroke - the saved version is also tidied (blank lines dropped).
const addressDraft = ref(store.details.value.address);
watch(
  () => store.details.value.address,
  (saved) => {
    addressDraft.value = saved;
  },
);

const CONTACT_LISTS: ContactList[] = ["phones", "emails"];

const drafts = reactive<Record<ContactList | "socials", string>>({ phones: "", emails: "", socials: "" });
const errors = reactive<Record<ContactList | "socials", ContactAddError | null>>({
  phones: null,
  emails: null,
  socials: null,
});
const socialPlatform = ref<SocialPlatform>("FACEBOOK");

function handleAddContact(list: ContactList) {
  if (drafts[list].trim() === "") {
    return;
  }
  errors[list] = store.addContact(list, drafts[list]);
  if (!errors[list]) {
    drafts[list] = "";
  }
}

function handleAddSocial() {
  if (drafts.socials.trim() === "") {
    return;
  }
  errors.socials = store.addSocial(socialPlatform.value, drafts.socials);
  if (!errors.socials) {
    drafts.socials = "";
  }
}

function handleDraftInput(list: ContactList | "socials", value: string) {
  drafts[list] = value;
  errors[list] = null;
}
</script>

<template>
  <div class="store-details">
    <label class="store-details__label" for="store-address">{{ t("settings.general.address") }}</label>
    <span class="store-details__hint">{{ t("settings.general.addressHint") }}</span>
    <textarea
      id="store-address"
      v-model="addressDraft"
      class="store-details__textarea"
      rows="2"
      :maxlength="ADDRESS_MAX_LENGTH"
      :placeholder="t('settings.general.addressPlaceholder')"
      @change="store.setAddress(addressDraft)"
    />
  </div>

  <div v-for="list in CONTACT_LISTS" :key="list" class="store-details">
    <span class="store-details__label">{{ t(`settings.general.${list}.heading`) }}</span>
    <span class="store-details__hint">{{ t("settings.general.contactHint", { max: CONTACT_MAX_ENTRIES }) }}</span>

    <ul v-if="store.details.value[list].length > 0" class="store-details__chips">
      <li v-for="(entry, index) in store.details.value[list]" :key="entry" class="store-details__chip">
        <span>{{ entry }}</span>
        <button
          type="button"
          class="store-details__remove"
          :aria-label="t('settings.general.remove', { entry })"
          :title="t('settings.general.remove', { entry })"
          @click="store.removeContact(list, index)"
        >
          &times;
        </button>
      </li>
    </ul>

    <form class="store-details__add" @submit.prevent="handleAddContact(list)">
      <input
        :type="list === 'phones' ? 'tel' : 'email'"
        class="store-details__input"
        :maxlength="CONTACT_MAX_LENGTH"
        :placeholder="t(`settings.general.${list}.placeholder`)"
        :aria-label="t(`settings.general.${list}.heading`)"
        :value="drafts[list]"
        @input="handleDraftInput(list, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="submit"
        class="store-details__add-button"
        :disabled="drafts[list].trim() === '' || store.details.value[list].length >= CONTACT_MAX_ENTRIES"
      >
        {{ t("settings.general.add") }}
      </button>
    </form>
    <p v-if="errors[list]" class="store-details__error">
      {{ t(`settings.general.${list}.errors.${errors[list]}`, { max: CONTACT_MAX_ENTRIES }) }}
    </p>
  </div>

  <div class="store-details">
    <span class="store-details__label">{{ t("settings.general.socials.heading") }}</span>
    <span class="store-details__hint">{{ t("settings.general.socials.hint", { max: CONTACT_MAX_ENTRIES }) }}</span>

    <ul v-if="store.details.value.socials.length > 0" class="store-details__chips">
      <li v-for="(link, index) in store.details.value.socials" :key="`${link.platform}:${link.handle}`" class="store-details__chip">
        <span>{{ formatSocialLink(link) }}</span>
        <button
          type="button"
          class="store-details__remove"
          :aria-label="t('settings.general.remove', { entry: formatSocialLink(link) })"
          :title="t('settings.general.remove', { entry: formatSocialLink(link) })"
          @click="store.removeSocial(index)"
        >
          &times;
        </button>
      </li>
    </ul>

    <form class="store-details__add" @submit.prevent="handleAddSocial">
      <select v-model="socialPlatform" class="store-details__select" :aria-label="t('settings.general.socials.platform')">
        <option v-for="platform in SOCIAL_PLATFORMS" :key="platform" :value="platform">
          {{ t(`storeDetails.platforms.${platform}`) }}
        </option>
      </select>
      <input
        type="text"
        class="store-details__input"
        :maxlength="CONTACT_MAX_LENGTH"
        :placeholder="t(`settings.general.socials.placeholder.${socialPlatform}`)"
        :aria-label="t('settings.general.socials.handle')"
        :value="drafts.socials"
        @input="handleDraftInput('socials', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="submit"
        class="store-details__add-button"
        :disabled="drafts.socials.trim() === '' || store.details.value.socials.length >= CONTACT_MAX_ENTRIES"
      >
        {{ t("settings.general.add") }}
      </button>
    </form>
    <p v-if="errors.socials" class="store-details__error">
      {{ t(`settings.general.socials.errors.${errors.socials}`, { max: CONTACT_MAX_ENTRIES }) }}
    </p>
  </div>
</template>

<style scoped>
.store-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  background: #ffffff;
  border: 2px solid #e2e2e2;
}

.store-details__label {
  font-weight: 700;
}

.store-details__hint {
  margin-top: -0.3rem;
  font-size: 0.85rem;
  color: #777777;
}

.store-details__textarea,
.store-details__input,
.store-details__select {
  min-height: 44px;
  padding: 0 0.75rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  font-size: 1rem;
}

.store-details__textarea {
  padding: 0.6rem 0.75rem;
  resize: vertical;
  font-family: inherit;
  line-height: 1.4;
}

.store-details__chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.store-details__chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 40px;
  padding: 0 0.25rem 0 0.85rem;
  border-radius: 10px;
  border: 2px solid #dcdcdc;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.store-details__remove {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #999999;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.store-details__remove:hover {
  background: #fbe9e7;
  color: #c0392b;
}

.store-details__add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.store-details__input {
  flex: 1;
  min-width: 0;
  max-width: 320px;
}

.store-details__add-button {
  min-height: 44px;
  padding: 0 1.1rem;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
}

.store-details__add-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.store-details__error {
  margin: 0;
  color: #c0392b;
  font-size: 0.9rem;
  font-weight: 600;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity. */
:where(:root[data-theme="dark"]) .store-details {
  background: #242424;
  border-color: #3a3a3a;
}

:where(:root[data-theme="dark"]) .store-details__textarea,
:where(:root[data-theme="dark"]) .store-details__input,
:where(:root[data-theme="dark"]) .store-details__select {
  background: #2e2e2e;
  border-color: #3a3a3a;
  color: #f6f6f6;
}

:where(:root[data-theme="dark"]) .store-details__chip {
  border-color: #444444;
}

:where(:root[data-theme="dark"]) .store-details__remove:hover {
  background: #4a2420;
  color: #ff9d8f;
}

:where(:root[data-theme="dark"]) .store-details__error {
  color: #ff8a7a;
}
</style>
