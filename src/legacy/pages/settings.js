// ============================================
// MOTION — Settings Page Module (Legacy)
// ============================================

import { AppState, setBreadcrumb, showToast, handleSignOut } from '../app.js';
import { getUserProfile, updateUserProfile, getSettings, updateSettings } from '../../lib/queries.js';

export async function renderSettings(container) {
  setBreadcrumb('Settings');

  const userId = AppState.user?.id;
  if (!userId) return;

  const [profileResult, settingsResult] = await Promise.all([getUserProfile(userId), getSettings(userId)]);

  const profile = profileResult.data || {};
  const settings = settingsResult.data || {};
  const prefs = settings.preferences || {};

  container.innerHTML = `
    <div class="flex-1 overflow-y-auto p-8 lg:p-12">
      <div class="max-w-4xl mx-auto">
        <header class="mb-12">
          <h2 class="font-['Inter'] tracking-tight text-[#2d3433] text-3xl font-bold">Settings</h2>
          <p class="text-on-surface-variant mt-2">Manage your personal preferences and workspace configuration.</p>
        </header>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-8">
          <nav class="md:col-span-3 space-y-1">
            <button class="w-full text-left px-4 py-2.5 rounded-lg bg-surface-container-lowest text-on-surface font-semibold shadow-sm text-sm flex items-center gap-3" data-settings-tab="account">
              <span class="material-symbols-outlined text-lg">person</span>
              My Account
            </button>
            <button class="w-full text-left px-4 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors text-sm flex items-center gap-3" data-settings-tab="workspace">
              <span class="material-symbols-outlined text-lg">business</span>
              Workspace
            </button>
            <button class="w-full text-left px-4 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors text-sm flex items-center gap-3" data-settings-tab="notifications">
              <span class="material-symbols-outlined text-lg">notifications</span>
              Notifications
            </button>
            <button class="w-full text-left px-4 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors text-sm flex items-center gap-3 mt-6 text-error" id="btn-sign-out">
              <span class="material-symbols-outlined text-lg">logout</span>
              Sign Out
            </button>
          </nav>

          <div class="md:col-span-9 space-y-12">
            <section class="space-y-6" id="settings-account">
              <div>
                <h3 class="text-lg font-semibold text-on-surface">My Account</h3>
                <p class="text-sm text-on-surface-variant">Update your photo and personal details.</p>
              </div>
              <div class="bg-surface-container-lowest p-6 rounded-xl space-y-8">
                <div class="flex items-center gap-6 pb-8 border-b border-surface-container-high">
                  <div class="relative group">
                    <div class="w-20 h-20 rounded-full overflow-hidden bg-surface-container-low flex items-center justify-center">
                      ${
                        profile.avatar_url
                          ? `<img class="w-full h-full object-cover" src="${profile.avatar_url}" alt="Profile" />`
                          : `<span class="text-2xl font-bold text-on-surface-variant">${(profile.name || 'U')[0].toUpperCase()}</span>`
                      }
                    </div>
                    <button class="absolute bottom-0 right-0 p-1.5 bg-white shadow-lg rounded-full text-primary hover:text-on-surface transition-colors">
                      <span class="material-symbols-outlined text-sm">edit</span>
                    </button>
                  </div>
                  <div>
                    <h4 class="font-medium">Profile Photo</h4>
                    <p class="text-xs text-on-surface-variant mt-1">PNG, JPG or GIF. Max 2MB.</p>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Full Name</label>
                    <input id="settings-name" class="w-full px-4 py-2.5 bg-surface-container rounded-lg border-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest text-sm transition-all" type="text" value="${
                      profile.name || ''
                    }" placeholder="Your name" />
                  </div>
                  <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Email Address</label>
                    <input id="settings-email" class="w-full px-4 py-2.5 bg-surface-container rounded-lg border-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest text-sm transition-all opacity-60" type="email" value="${
                      profile.email || ''
                    }" disabled />
                  </div>
                </div>
              </div>
            </section>

            <section class="space-y-6" id="settings-notifications">
              <div>
                <h3 class="text-lg font-semibold text-on-surface">Notifications</h3>
                <p class="text-sm text-on-surface-variant">Configure how you want to be notified.</p>
              </div>
              <div class="bg-surface-container-lowest rounded-xl overflow-hidden">
                ${renderNotificationRow('email_notifications', 'mail', 'Email Notifications', 'Receive daily digests and activity summaries.', prefs.email_notifications)}
                ${renderNotificationRow('direct_messages', 'chat_bubble', 'Direct Messages', 'Get notified when someone sends you a message.', prefs.direct_messages)}
                ${renderNotificationRow('product_updates', 'rocket_launch', 'Product Updates', 'Stay up to date with new features and releases.', prefs.product_updates)}
              </div>
            </section>

            <div class="flex items-center justify-end gap-3 pt-6 border-t border-surface-container-high">
              <button class="px-6 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors" id="btn-cancel">Cancel</button>
              <button class="px-8 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg shadow-sm hover:bg-primary-dim transition-all active:scale-95" id="btn-save-settings">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const name = document.getElementById('settings-name')?.value;
    const toggles = container.querySelectorAll('.notification-toggle');
    const newPrefs = {};
    toggles.forEach((t) => {
      newPrefs[t.dataset.key] = t.checked;
    });

    try {
      await updateUserProfile(userId, { name });
      await updateSettings(userId, { preferences: newPrefs });
      AppState.profile = { ...AppState.profile, name };
      showToast('Settings saved!', 'success');
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    }
  });

  document.getElementById('btn-sign-out')?.addEventListener('click', handleSignOut);
  document.getElementById('btn-cancel')?.addEventListener('click', () => renderSettings(container));
}

function renderNotificationRow(key, icon, label, description, checked) {
  return `
    <div class="flex items-center justify-between p-5 hover:bg-surface-container-low/30 transition-colors ${
      key !== 'email_notifications' ? 'border-t border-surface-container-low' : ''
    }">
      <div class="flex items-center gap-4">
        <div class="w-10 h-10 rounded-lg bg-tertiary-container/30 flex items-center justify-center text-tertiary">
          <span class="material-symbols-outlined">${icon}</span>
        </div>
        <div>
          <p class="text-sm font-medium">${label}</p>
          <p class="text-xs text-on-surface-variant">${description}</p>
        </div>
      </div>
      <label class="relative inline-flex items-center cursor-pointer">
        <input class="sr-only peer notification-toggle" type="checkbox" data-key="${key}" ${checked ? 'checked' : ''} />
        <div class="w-10 h-5 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
      </label>
    </div>
  `;
}
