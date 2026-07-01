import {onMessage, sendMessage} from '@typo3/visual-editor/Shared/iframe-messaging';

class LocalStore extends EventTarget {
  constructor(key, defaultValue = null) {
    super();
    this.key = key;
    if (localStorage.getItem(this.key) === null && defaultValue !== undefined) {
      localStorage.setItem(this.key, JSON.stringify(defaultValue));
    }
    onMessage('localStoreChange', ({key, value}) => {
      if (key === this.key) {
        localStorage.setItem(this.key, JSON.stringify(value));
        this.dispatchEvent(new Event('change'));
      }
    });
    onMessage('localStoreRequest', (requestedKey) => {
      if (requestedKey === this.key) {
        sendMessage('localStoreChange', {key: this.key, value: this.get()}, 'iframe');
      }
    });
    sendMessage('localStoreRequest', this.key, 'parent');
  }

  get() {
    return JSON.parse(localStorage.getItem(this.key));
  }

  set(value) {
    localStorage.setItem(this.key, JSON.stringify(value));
    this.dispatchEvent(new Event('change'));
    sendMessage('localStoreChange', {key: this.key, value});
  }
}

function localStore(key, defaultValue) {
  return new LocalStore(key, defaultValue);
}

export const elementLibraryOpen = localStore('ve-element-library-open', false);
export const elementLibrarySearch = localStore('ve-element-library-search', '');
export const elementLibraryCategories = localStore('ve-element-library-categories', []);
export const elementLibraryRecent = localStore('ve-element-library-recent', []);
