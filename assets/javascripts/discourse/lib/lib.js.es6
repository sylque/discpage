import ApplicationRoute from 'discourse/routes/application';
import TopicNavigationComponent from 'discourse/components/topic-navigation';
import User from 'discourse/models/user';
import { iconHTML } from 'discourse-common/lib/icon-library';
import { relativeAge } from 'discourse/lib/formatter';
import { withPluginApi } from 'discourse/lib/plugin-api';

//------------------------------------------------------------------------------

const u = {};

//------------------------------------------------------------------------------

u.log = (...args) => {
  args = [`%cDiscPage -`, 'color:grey', ...args];
  console.log(...args);
};

u.logError = (...args) => {
  args = [`%cDiscPage Error -`, 'color:red', ...args];
  console.log(...args);
};

u.logWarning = (...args) => {
  args = [`%cDiscPage Warning -`, 'color:orange', ...args];
  console.log(...args);
};

/*
// https://stackoverflow.com/questions/6234773/can-i-escape-html-special-chars-in-javascript
u.escapeHtml = unsafe =>
  unsafe &&
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
*/
// See https://medium.com/@xpl/javascript-deriving-from-error-properly-8d2f8f315801
u.DiscpageError = class extends Error {
  constructor(msg) {
    super(msg);
    this.constructor = u.DiscpageError;
    this.__proto__ = u.DiscpageError.prototype;
    this.message = msg;
    this.name = 'DiscpageError';
  }
};

u.throw = msg => {
  throw new u.DiscpageError(msg)
};

u.throwIf = (cond, msg) => cond && u.throw(msg);
u.throwIfNot = (cond, msg) => !cond && u.throw(msg);

// Functions from the "dev" field might be striped out of production code
u.dev = {
  assert: (cond, msg) =>
    u.throwIf(!cond, `Assertion Failed${msg ? ' - ' + msg : ''}`),
  log: u.log,
  logWarning: u.logWarning,
  logError: u.logError
};

// Return true if we are in an iframe
// https://stackoverflow.com/a/326076/3567351
u.inIFrame = () => {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
};

//------------------------------------------------------------------------------

/*
// https://stackoverflow.com/a/41532415/3567351
// https://stackoverflow.com/questions/6393943/convert-javascript-string-in-dot-notation-into-an-object-reference/6394168#6394168

u.get = function(obj, fieldNameDotNotation) {
  return fieldNameDotNotation.split('.').reduce((o, i) => o[i], obj)
}
*/

/*
u.pick = (o, keys) =>
  o
    ? keys.reduce((res, key) => {
        if (o.hasOwnProperty(key)) {
          res[key] = o[key]
        }
        return res
      }, {})
    : o

u.omit = (o, keys) =>
  o
    ? Object.keys(o).reduce((res, key) => {
        if (!keys.includes(key)) {
          res[key] = o[key]
        }
        return res
      }, {})
    : o
*/

//------------------------------------------------------------------------------
/*
// https://stackoverflow.com/a/265125/3567351
// https://stackoverflow.com/a/26127647/3567351
const c = document.cookie
console.log('c: ', c)
const loadedFromBrowserCache = c.includes('loadedFromBrowserCache=false')
  ? false
  : c.includes('loadedFromBrowserCache=true') ? true : undefined
document.cookie = 'loadedFromBrowserCache=true'

// Return true if the current page has been loaded from the browser cache
u.loadedFromBrowserCache = () => {
  u.throwIf(
    loadedFromBrowserCache === undefined,
    'Missing cookie "loadedFromBrowserCache". Check your server.'
  )
  return loadedFromBrowserCache
}
*/
//------------------------------------------------------------------------------

/*
// https://stackoverflow.com/a/31991870/3567351
// Notice that the npm packages is-absolute-url and is-relative-url fail for
// url of type //google.com/blablabla
const absoluteUrlRegex = /(?:^[a-z][a-z0-9+.-]*:|\/\/)/i
dcsQuery.isAbsoluteUrl = url => absoluteUrlRegex.test(url)
*/
//------------------------------------------------------------------------------

// https://stackoverflow.com/a/4314050
u.spliceStr = (str, start, delCount, insertStr) =>
  str.slice(0, start) + insertStr + str.slice(start + Math.abs(delCount));

u.async = {
  // Like the standard "forEach" function, but the callback can return a promise
  // to wait for before iterating. Use only arguments 1 and 2 (others
  //  are used internally). See https://stackoverflow.com/a/46295049/286685
  forEach(arr, fn, busy, err, i = 0) {
    const body = (ok, er) => {
      try {
        const r = fn(arr[i], i, arr);
        r && r.then ? r.then(ok).catch(er) : ok(r);
      } catch (e) {
        er(e);
      }
    };
    const next = (ok, er) => () => u.async.forEach(arr, fn, ok, er, ++i);
    const run = (ok, er) =>
      i < arr.length ? new Promise(body).then(next(ok, er)).catch(er) : ok();
    return busy ? run(busy, err) : new Promise(run)
  },

  // Create a promise with 2 additional functions (resolve and reject) and one
  // addition (state)
  // createfun: optional, the usual promise creation function -> (resolve, reject) => { ... }
  createPromise(createfun) {
    // Create the promise
    let originalResolve, originalReject;
    const promise = new Promise((resolve, reject) => {
      originalResolve = resolve;
      originalReject = reject;
    });

    // Enriched the promise
    promise.state = 'pending';
    promise.resolve = value => {
      originalResolve(value);
      if (promise.state === 'pending') {
        promise.state = 'resolved';
      }
    };
    promise.reject = value => {
      originalReject(value);
      if (promise.state === 'pending') {
        promise.state = 'rejected';
      }
    };

    // Call the original creation function (if any)
    createfun && createfun(promise.resolve, promise.reject);

    return promise
  },

  // Use like this:
  // u.async.promiseState(a).then(state => console.log(state)); // Output: fulfilled | rejected | pending
  // https://stackoverflow.com/a/35820220/3567351
  promiseState(p) {
    const t = {};
    return Promise.race([p, t]).then(
      v => (v === t ? 'pending' : 'fulfilled'),
      () => 'rejected'
    )
  },

  // Call like this: delay(1000).then(() => { do_something })
  delay: (ms, returnValue) =>
    new Promise(resolve => {
      setTimeout(() => {
        resolve(returnValue);
      }, ms);
    }),

  // Retry calling fn until:
  // - it returns a truthy value (or a Promise resolving to truthy)
  // - retries is reached, in which case the function return a rejected promise
  retry: (fn, retries, res = undefined) =>
    retries === 0
      ? Promise.reject(res)
      : Promise.resolve(fn(res, retries)).then(
          res => res || u.async.retry(fn, retries - 1, res)
        ),

  // Call like this: retryDelay(fn, 5, 1000).then(() => { do_something }), fn
  // being a function that might returns a promise
  retryDelay(fn, retries, ms, err = undefined) {
    const fnDelayed = retries => u.async.delay(ms).then(() => fn(retries));
    try {
      return retries === 0
        ? Promise.reject(err)
        : Promise.resolve(fn(retries)).then(
            res => res || u.async.retryDelay(fnDelayed, retries - 1)
          )
    } catch (e) {
      return Promise.reject(e)
    }
  },

  // Resolve to undefined if not found (never reject)
  // A bit complex because we support  finding in an array of promises
  find: (array, fn, err = null) =>
    !array || array.length === 0
      ? Promise.resolve(undefined)
      : Promise.resolve(fn(array[0])).then(res =>
          res ? array[0] : u.async.find(array.slice(1), fn, err)
        )
};

u.dom = {
  // Resolve when DOM is ready
  onDOMReady() {
    return new Promise(resolve => {
      if (document.readyState !== 'loading') {
        resolve();
      } else {
        document.addEventListener('DOMContentLoaded', resolve);
      }
    })
  },

  // https://github.com/imagitama/nodelist-foreach-polyfill/blob/master/index.js
  forEach(nodeList, callback, scope) {
    // Duplicate the list, so that we can iterate over a dynamic node list
    // returned by getElementsByClassName() and the likes. If we don't, the
    // following won't work, as we change the list dynamically while we iterate
    // over it:
    // u.dom.forEach(document.getElementsByClassName('toto'), node => node.classList.remove('toto'))
    const list = [...nodeList];
    for (let i = 0; i < list.length; i++) {
      callback.call(scope || window, list[i], i);
    }
  },

  wrap(el, wrapper) {
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
    return wrapper
  },

  wrapAll(elArray, wrapper) {
    if (elArray && elArray.length) {
      // Duplicate the array in case it is a DOM nodeList than would be modified
      // while we move elements
      const copyArray = Array.prototype.slice.call(elArray);
      copyArray[0].parentNode.insertBefore(wrapper, copyArray[0]);
      copyArray.forEach(el => wrapper.appendChild(el));
    }
    return wrapper
  },

  createElement(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild
  }
};

u.dot = {
  set(obj, name, value) {
    const split = name.split('.');
    u.throwIf(!split.length);
    const lastName = split.pop();
    const o = split.reduce((o, n) => (o[n] = {}), obj);
    o[lastName] = value;
  },
  get(obj, name) {
    return name
      .split('.')
      .reduce((o, n) => (o !== undefined ? o[n] : undefined), obj)
  }
};

// A discpage tag is of the form: dpg-PAGENAME-CLIENTROUTE-TRIGGERID

// DON'T USE 'THIS' IN OBJECT LITERALS:
// http://closuretools.blogspot.com/2012/09/which-compilation-level-is-right-for-me.html

const DpgTag = {
  _PREFIX: 'dpg',
  _PAGE_ID_REGEX: /^[0-9]+$/,
  _TRIGGER_ID_REGEX: /^[0-9A-Za-z_]+$/,

  build({ pageId, triggerId }) {
    DpgTag.checkPageIdThrow(pageId);
    triggerId && DpgTag.checkTriggerIdThrow(triggerId);
    return triggerId
      ? `${DpgTag._PREFIX}-${pageId}-${triggerId}`
      : `${DpgTag._PREFIX}-${pageId}`
  },

  parse(dcsTag) {
    const split = dcsTag.split('-');

    if (split.shift() !== DpgTag._PREFIX) {
      return null
    }

    const pageId = split.shift();
    if (!DpgTag.checkPageId(pageId)) {
      return null
    }

    const triggerId = split.shift();
    if (triggerId && !DpgTag.checkTriggerId(triggerId)) {
      return null
    }

    return { pageId, triggerId }
  },

  checkPageId(pageId) {
    return DpgTag._PAGE_ID_REGEX.test(pageId)
  },

  checkPageIdThrow(pageId) {
    if (!DpgTag.checkPageId(pageId)) {
      u.throw(`Invalid pageId "${pageId}"`);
    }
  },

  checkTriggerId(triggerId) {
    return DpgTag._TRIGGER_ID_REGEX.test(triggerId)
  },

  checkTriggerIdThrow(triggerId) {
    if (!DpgTag.checkTriggerId(triggerId)) {
      u.throw(`Invalid balloon id "${triggerId}". Valid characters are: [0-9A-Za-z_].`);
    }
  }
};

const discourseAPI = {
  commentTopicTitle(dcsTag) {
    return `DiscPage comments (${dcsTag})`
  },

  _request({ method, path, params = undefined }) {
    return new Promise((resolve, reject) => {
      $.ajax({
        ['type']: method,
        ['url']: path,
        ['data']: params,
        ['success']: data => resolve(data)
      }).fail(e => reject(e.responseText));
    })
  },

  // TOPICS

  getTopicList({ tag }) {
    return discourseAPI
      ._request({ method: 'GET', path: `/tag/${tag}.json` })
      .then(tagObj => tagObj['topic_list']['topics'])
  },

  // Beware:
  // - the topic id is in topic.topic_id
  // - topic.id is the is of the first topic post
  newTopic({ title, content, catId, tags }) {
    return discourseAPI._request({
      method: 'POST',
      path: `/posts`,
      params: { ['title']: title, ['raw']: content, ['category']: catId, ['tags']: tags || [] }
    })
  },

  // Delete a topic
  // Beware that topics created by the system user (such as the category "About"
  // topics) cannot be deleted and will throw an exception
  delTopic({ topicId }) {
    return discourseAPI._request({
      method: 'DELETE',
      path: `/t/${topicId}.json`
    })
  },

  // CATEGORIES

  getCatList() {
    return discourseAPI
      ._request({ method: 'GET', path: `/categories.json` })
      .then(obj => obj['category_list']['categories'])
  },

  // TAGS

  getTagList() {
    return discourseAPI._request({ method: 'GET', path: '/tags.json' })
  },

  // tags is an array of strings
  newTags(tags) {
    return (
      discourseAPI
        .newTopic({
          title: 'Temporary DiscPage-generated topic ' + Date.now(),
          content:
            'This topic was supposed to be removed and should not be there.',
          tags
        })
        // SOmetimes the topic is not deleted. Hope this will help.
        .then(tempTopic => u.async.delay(2000, tempTopic))
        .then(tempTopic =>
          discourseAPI.delTopic({ topicId: tempTopic['topic_id'] })
        )
    )
  },

  // notificationLevel = 0..3
  // PUT
  // Url: /tag/dcs-missio-test1/notifications
  // Data: tag_notification[notification_level]: 3
  setTagNotification({ tag, notificationLevel }) {
    return discourseAPI._request({
      method: 'PUT',
      path: `/tag/${tag}/notifications`,
      params: {
        ['tag_notification']: { ['notification_level']: notificationLevel }
      }
    })
  },

  // TAG GROUPS

  getAllTagGroups() {
    return discourseAPI._request({ method: 'GET', path: '/tag_groups.json' })
  },

  // if onePerTopic = true, limit one tag per topic from this group
  // if staffOnly = true, tags are visible only to staff
  // THE 2 LAST PARAMS DOESN'T WORK, it seems the API doesn't support them.
  // See https://docs.discourse.org/#tag/Tags/paths/~1tag_groups.json/post
  newTagGroup({ name, tags, onePerTopic = false, staffOnly = false }) {
    const permissions = staffOnly ? { ['staff']: 1 } : undefined;
    return discourseAPI._request({
      method: 'POST',
      path: `/tag_groups`,
      params: {
        ['name']: name,
        ['tag_names']: tags,
        ['one_per_topic']: onePerTopic, // DOESN'T WORK!!!
        ['permissions']: permissions    // DOESN'T WORK!!!
      }
    })
  },

  updateTagGroup({ id, tags }) {
    return discourseAPI._request({
      method: 'PUT',
      path: `/tag_groups/${id}.json`,
      params: { ['tag_names']: tags }
    })
  }
};

class DcsLayout {
  //----------------------------------------------------------------------------

  constructor(appCtrl, pageCats) {
    this.appCtrl = appCtrl;
    this.pageCats = pageCats;
    this.saveMobileView = appCtrl.site.mobileView;
    this.left = document.getElementById('dpg-left');
    this.ghost = document.getElementById('dpg-ghost');
    this.layout = null;
    this.pageId = null;
    this.cooked = null;

    // Check if user is admin
    const user = User.current();
    this.userIsAdmin = user && user['admin'];

    // Get all dpg tags and store them, together with their parsed version
    this.tagsPromise = discourseAPI.getTagList().then(tags =>
      tags['tags'].reduce((res, tag) => {
        tag.parsed = DpgTag.parse(tag.id);
        return tag.parsed ? [...res, tag] : res
      }, [])
    );

    // Get all dpg tag groups
    if (this.userIsAdmin) {
      this.tagGroupsPromise = discourseAPI.getAllTagGroups().then(tagGroups =>
        tagGroups['tag_groups'].reduce((res, tagGroup) => {
          tagGroup = {
            id: tagGroup['id'],
            name: tagGroup['name'],
            tag_names: tagGroup['tag_names']
          };
          // Warning here: some buggy plugins create tag groups without names
          if (tagGroup.name && tagGroup.name.startsWith('dpg-')) {
            const pageId = tagGroup.name.substring('dpg-'.length);
            if (DpgTag.checkTriggerId(pageId)) {
              // Sort the tags for array comparison later
              tagGroup.tag_names.sort();
              return [...res, tagGroup]
            } else {
              u.logWarning(`Invalid discpage tag group "${tagGroup.name}"`);
            }
          }
          return res
        }, [])
      );
    }
  }

  //----------------------------------------------------------------------------

  getShowRightQP() {
    return this.appCtrl.get('showRight')
  }

  //----------------------------------------------------------------------------

  fillLeft({ pageId, postId, lastRevNum, cooked, title, selTriggerId }) {
    u.dev.assert(typeof pageId === 'string');

    // Reset scroll pos in case of new page, or if it's the same page but we've
    // gone through layout 1 meantime (full Discourse)
    if ((pageId !== this.pageId || this.layout === 1) && !selTriggerId) {
      this.left.scrollTo(0, 0);
    }

    if (postId && lastRevNum && cooked && title) {
      if (pageId === this.pageId && cooked === this.cooked) {
        // Case user has clicked on a balloon in the same page. Need to check
        // 'cooked' in case user has just edited the topic
        this._highlightTrigger({ selTriggerId });
        return
      }

      this.pageId = pageId;
      this.cooked = cooked;

      this._fillLeftWithHtml({
        pageId,
        postId,
        lastRevNum,
        curRevNum: 'nodiff',
        curRevDate: undefined,
        cooked,
        title,
        selTriggerId
      });
    } else {
      if (pageId === this.pageId) {
        // Case user has clicked on a balloon in the same page
        this._highlightTrigger({ selTriggerId });
        return
      }

      get(`/t/${pageId}.json`)
        .then(topic => {
          this.pageId = pageId;

          // Check if the topic is still a valid static page (might have been
          // deleted, category might have been changed...)
          if (!this.pageCats.find(c => c['id'] === topic['category_id'])) {
            this.cooked = 'error';
            u.log(
              `Won't display static page ${pageId}, because category ${topic[
                'category_id'
              ]} is not a static page`
            );
            this._fillLeftWithOops();
          } else {
            const post = topic['post_stream']['posts'][0];
            this.cooked = post['cooked'];
            this._fillLeftWithHtml({
              pageId,
              postId: post['id'],
              lastRevNum: post['version'],
              curRevNum: 'nodiff',
              curRevDate: undefined,
              cooked: this.cooked,
              title: topic['fancy_title'],
              selTriggerId
            });
          }
        })
        .catch(e => {
          this.cooked = 'error';
          u.log(
            `Won't display static page ${pageId}, because it doesn't exist or is private`
          );
          this._fillLeftWithOops();
        });
    }
  }

  //----------------------------------------------------------------------------

  _fillLeftWithOops() {
    this._fillLeftWithHtml({
      pageId: 'error',
      postId: undefined,
      lastRevNum: undefined,
      curRevNum: 'nodiff',
      curRevDate: undefined,
      cooked: '<p>Please contact your administrator.</p>',
      title: "Oops! That page doesn't exist anymore",
      selTriggerId: null
    });
  }

  //----------------------------------------------------------------------------

  _fillLeftWithHtml({
    pageId,
    postId,
    lastRevNum,
    curRevNum,
    curRevDate,
    cooked,
    title,
    selTriggerId
  }) {
    u.dev.assert(typeof pageId == 'string', `invalid pageId "${pageId}"`);

    // Remove the "revision button" tag
    cooked = cooked
      .replace('{dpg-show-rev-button}', '')
      .replace('{dpg-title-balloon}', '');

    // Create the page content skeleton
    // The dgp-header and dph-footer sections mimic the actual dpg-body, so
    // that webmasters can align background images in the header/footer with
    // texts from the post.
    const content = $(`
      <div class="dpg-page-content">
        <div class="dpg-buttons ${curRevNum !== 'nodiff' ? 'selected' : ''}">
          <div class="dpg-buttons-left"></div><div class="dpg-buttons-center"></div><div class="dpg-buttons-right"></div>        
        </div>
        <div class="dpg-header">
          <div class="dpg-header-1"><div class="dpg-header-2"><div class="dpg-header-3"></div></div></div>
        </div>
        <div class="dpg-body">
          <div class="wrap">
            <!-- <div class="posts-wrapper"> FIX FOR ISSUE https://github.com/sylque/discpage/issues/6 --> 
              <div class="topic-body">
                <!-- Cooked post to be inserted here -->
              </div>
            <!-- </div> -->
          </div>
        </div>
        <div class="dpg-footer">
          <div class="dpg-footer-1"><div class="dpg-footer-2"><div class="dpg-footer-3"></div></div></div>
        </div>
      </div>
    `);

    // Add the post html (cooked version)
    // Here we need the "cooked + decorated" version of the post. Decorators
    // are very important, because they load pictures (lazy loading) and call
    // the bbcode rendering. Lazy loading decorator:
    // https://github.com/discourse/discourse/blob/2d3113e4da74be2a0288dbe3273093cd2d27fd21/app/assets/javascripts/discourse/lib/lazy-load-images.js.es6#L107
    const titleBalloon = this.cooked.includes('{dpg-title-balloon}')
      ? '<span class="dpg-balloon-text" data-dpg-id="title"></span>'
      : '';
    const cookedWithTitle = `<h1>${title + titleBalloon}</h1>\n` + cooked;
    const postCookedObject = this.decoratorHelper['cooked'](cookedWithTitle);
    const cookedAndDecorated = postCookedObject['init']();
    content.find('.dpg-body .topic-body').append(cookedAndDecorated);

    const forceLowercase = this.appCtrl.siteSettings['force_lowercase_tags'];
    const maxTagLength = this.appCtrl.siteSettings['max_tag_length'];

    // Hide all badges for now
    content.find('.dpg-badge').hide();

    // Go through balloons
    const dpgTags = {};
    content.find('.dpg-balloon-text').each((i, textEl) => {
      let dpgTag;
      const balloonId = textEl.dataset['dpgId'];

      let $balloonText = $(textEl);

      try {
        // Get the balloon id
        u.throwIf(
          !balloonId,
          'Missing balloon id. The correct syntax is [dpgb id=something][/dpgb].'
        );

        // Build the dpgTag
        dpgTag = DpgTag.build({ pageId, triggerId: balloonId });

        // Check tag length, case and duplicates
        u.throwIf(
          dpgTag.length > maxTagLength,
          `Balloon id is too long. Resulting tag is \"${dpgTag}\", which has a length of ${dpgTag.length}. This doesn't fit max_tag_length=${maxTagLength} in Discourse settings. Fix: either shorten the balloon id, or increase max_tag_length.`
        );
        u.throwIf(
          forceLowercase && dpgTag !== dpgTag.toLowerCase(),
          `Balloon id has uppercase. This doesn't fit force_lowercase_tags=true in Discourse settings. Fix: either make your balloon id all lowercase, or set force_lowercase_tags to false.`
        );

        // USER MIGHT NEED DUPLICATES! For example with multilingual posts.
        if (dpgTags[dpgTag]) {
          u.logWarning(
            `Duplicate balloon id "${dpgTag}". This is usually a bad idea.`
          );
        }
      } catch (e) {
        if (e instanceof u.DiscpageError) {
          u.logError(e.message);
          $balloonText.append(
            `<span class="dpg-error" title="${e.message}">DiscPage Error</span>`
          );
          return
        }
        throw e
      }

      // Yes! We found a balloon:
      dpgTags[dpgTag] = true;

      // Build the right dpg-balloon-parent and dpg-balloon-text nodes
      let $balloonParent;
      if (textEl.childNodes.length === 0) {
        // Case empty text
        const isRoot = $balloonText.parent().is('.cooked,.dpg-subsec');
        const $precedingBlock = $balloonText.prev();
        if (isRoot && $precedingBlock.length) {
          // Case empty text *after* a block (for example a balloon after a
          // picture): take the empty text block and put it around the
          // content of the preceding block.
          $balloonParent = $precedingBlock;
        } else {
          // Case empty text *in* a block (for example a balloon at the end
          // of a heading): take the empty text block and put it around the
          // content of the parent block.
          $balloonParent = $balloonText.parent();
        }
        $balloonText.detach();
        $balloonParent.addClass('dpg-balloon-parent').wrapInner($balloonText);
      } else {
        // Case non-empty text: just create the parent around the balloon text
        $balloonText.wrap('<span class="dpg-balloon-parent" />');
        $balloonParent = $balloonText.parent();
      }

      // Add the icons (balloon and badge)
      $balloonParent.append(`
        <span class="dpg-icons" title="Click to discuss this part">
          <span class="dpg-balloon">${iconHTML('comment')}</span>
          <span class="dpg-badge" style="display:none">99</span>
        </span>
      `);

      // Insert the subsec if needed
      if ($balloonParent.is('h1,h2,h3,h4,h5,h6')) {
        $balloonParent
          .nextUntil('h1,h2,h3,h4,h5,h6')
          .addBack()
          .wrapAll('<div class="dpg-subsec"></div>');
      }

      // Set the balloon click handler
      $balloonParent.find('.dpg-icons').click(e => {
        this.appCtrl.get('router').transitionTo(`/tag/${dpgTag}`);

        // This is useless, since the new route will select the correct trigger
        // anyway a second later. But we do it nonetheless, so that the UI is
        // more responsive.
        this._highlightTrigger({ selTriggerId: balloonId });

        // Prevent bubbling to top-level, because a click on top-level
        // is used for deselection
        e.stopPropagation();
      });
    });

    // Admin only: create the Discourse tags corresponding to all balloons found
    // THERE IS AN ISSUE HERE: aren't normal users supposed to be allowed to
    // create static pages with balloons? No, we need to forbid that.
    const tags = Object.keys(dpgTags);
    if (this.userIsAdmin && tags.length) {
      this.tagGroupsPromise.then(tagGroups => {
        const tagGroupName = `dpg-${pageId}`;
        const existingTabGroup = tagGroups.find(
          tagGroup => tagGroup.name === tagGroupName
        );
        tags.sort();
        if (existingTabGroup) {
          if (!equals(existingTabGroup.tag_names, tags)) {
            discourseAPI.updateTagGroup({ id: existingTabGroup.id, tags });
          }
        } else {
          discourseAPI.newTagGroup({ name: tagGroupName, tags });
        }
      });
    }

    // Update badges
    this.tagsPromise.then(tags => {
      // What's the problem here? tag.count includes deleted and unlisted topics
      // See https://github.com/sylque/discpage/issues/5

      // Create the badge list for this page
      const badges = tags.reduce((res, tag) => {
        if (tag.count && tag.parsed.pageId === pageId) {
          const $text = content.find(
            `.dpg-balloon-text[data-dpg-id="${tag.parsed.triggerId}"]`
          );
          if ($text.length) {
            tag.$badgeNode = $text.next().find('.dpg-badge');
            res.push(tag);
          } else {
            u.logWarning(
              `In page "${pageId}": missing balloon for tag "${tag.id}"`
            );
          }
        }
        return res
      }, []);

      // Display the badges
      u.async.forEach(badges, badge =>
        discourseAPI
          .getTopicList({ tag: badge.id })
          .then(topics => {
            const count = topics.filter(topic => topic.visible).length;
            if (count) {
              badge.$badgeNode.text(count).show();
            }
          })
          // We wait a bit, so as to not be caught by Discourse security
          // (pure precaution, as I didn't test without this throttling)
          .then(() => u.async.delay(250))
      );
    });

    const rightButtons = content.find('.dpg-buttons-right');
    const centerButtons = content.find('.dpg-buttons-center');

    // Insert revision navigation if last post revision ends with {dpg-rev-nav}
    const showRevButton = this.cooked.includes('{dpg-show-rev-button}');
    if (!this.saveMobileView && lastRevNum > 1 && showRevButton) {
      // Define a function to update the content
      const fillLeft = ({ curRevNum, rev = null }) => {
        this._fillLeftWithHtml({
          pageId,
          postId,
          lastRevNum,
          curRevNum,
          curRevDate: rev ? rev['created_at'] : undefined,
          cooked: rev ? rev['body_changes']['inline'] : this.cooked,
          title,
          selTriggerId
        });
      };

      const showRevNav = curRevNum !== 'nodiff';

      // Insert the "Show revisions" button
      $faIcon({
        iconName: 'history',
        title: 'Show page revisions',
        id: 'dpg-show-rev-nav'
      })
        .click(() => {
          if (!showRevNav) {
            get(`/posts/${postId}/revisions/${lastRevNum}.json`).then(rev => {
              fillLeft({ curRevNum: lastRevNum, rev });
            });
          } else {
            fillLeft({ curRevNum: 'nodiff' });
          }
        })
        .appendTo(rightButtons);

      if (showRevNav) {
        $faIcon({
          iconName: 'backward',
          title: 'Previous revisions',
          id: 'dpg-prev-rev',
          disabled: curRevNum === 2
        })
          .appendTo(centerButtons)
          .click(() => {
            const newRevNum = curRevNum - 1;
            get(`/posts/${postId}/revisions/${newRevNum}.json`).then(rev => {
              fillLeft({ curRevNum: newRevNum, rev });
            });
          });

        const date = new Date(curRevDate);
        const age = relativeAge(date, { format: 'medium-with-ago' });
        centerButtons.append(
          `<span class="dpg-date" title=${date}>${age}</span>`
        );

        $faIcon({
          iconName: 'forward',
          title: 'Next revision',
          id: 'dpg-next-rev',
          disabled: curRevNum === lastRevNum
        })
          .appendTo(centerButtons)
          .click(() => {
            const newRevNum = curRevNum + 1;
            get(`/posts/${postId}/revisions/${newRevNum}.json`).then(rev => {
              fillLeft({ curRevNum: newRevNum, rev });
            });
          });
      }
    }

    // Insert admin buttons
    if (this.userIsAdmin) {
      // Wrench button
      $faIcon({
        iconName: 'wrench',
        title: 'Edit title',
        id: 'dpg-edit-title-button'
      })
        .click(() => {
          $('html').toggleClass('dpg', false);
          $('a.edit-topic').click();
          $('#main-outlet').click(e => {
            const clickedBtn = e.target.closest(
              '.edit-controls .btn, .topic-admin-popup-menu .topic-admin-reset-bump-date, .topic-admin-popup-menu .topic-admin-visible'
            );
            if (clickedBtn) {
              this._fillLeftWithHtml({
                pageId,
                postId,
                lastRevNum,
                curRevNum,
                curRevDate,
                cooked,
                title: $('input#edit-title').val(),
                selTriggerId
              });
              $('html').toggleClass('dpg', true);
            }
          });
        })
        .wrap('<div><div>')
        .parent()
        .appendTo(rightButtons);

      // Edit button
      $faIcon({
        iconName: 'pencil-alt',
        title: 'Edit page',
        id: 'dpg-edit-page-button'
      })
        .click(() => {
          // Find Discourse edit button. It might be hidden under the "..." button.
          const discEditBtn = $('article#post_1 button.edit');
          if (discEditBtn.length) {
            discEditBtn.click();
            setFullScreenComposer(this.saveMobileView);
          } else {
            const discShowMoreBtn = $('article#post_1 button.show-more-actions');
            discShowMoreBtn.click();
            setTimeout(() => {
              const discEditBtn = $('article#post_1 button.edit');
              discEditBtn.click();
              setFullScreenComposer(this.saveMobileView);
            }, 0);
          }
        })
        .wrap('<div><div>')
        .parent()
        .appendTo(rightButtons);
    }

    // Insert the page content
    $(this.left).empty().append(content);

    // Highlight the selected balloon
    this._highlightTrigger({ selTriggerId });

    // Send a custom event to <html>, for customization purpose
    document.documentElement.dispatchEvent(
      new CustomEvent('dpg_displaypage', {
        detail: {
          ['pageId']: parseInt(pageId),
          ['title']: title,
          ['cooked']: cooked,
          ['node']: content[0],
          ['selTriggerId']: selTriggerId,
          ['curRevNum']: curRevNum,
          ['curRevDate']: curRevDate
        }
      })
    );

    /*
    const selectedHeader = content.find('.dpg-balloon-text.dpg-highlighted')
    if (selectedHeader.length) {
      selectedHeader[0].scrollIntoView()
    }
    */
  }

  //----------------------------------------------------------------------------

  _highlightTrigger({ selTriggerId }) {
    const $left = $(this.left);

    // Unselect everything
    $left.find('.dpg-balloon-text, .dpg-subsec').removeClass('dpg-highlighted');

    // If no trigger is selected, quit
    if (!selTriggerId) {
      return
    }

    // Find the selected header
    const $selText = $left.find(
      `.dpg-balloon-text[data-dpg-id=${selTriggerId}]`
    );
    if (!$selText.length) {
      u.logWarning(
        `selected balloon "${selTriggerId}" has not been found in page "${this
          .pageId}"`
      );
      return
    }

    // Highlight the header and parent subsection
    $selText.addClass('dpg-highlighted');
    if ($selText.parent().is('h1,h2,h3,h4,h5,h6')) {
      // Important test
      $selText.closest('.dpg-subsec').addClass('dpg-highlighted');
    }

    // Scroll into view if needed. The visibility test is required, because
    // we don't want to scroll when the user has clicked on a balloon.
    // Remember that we need to highlight a header when: user clicks a balloon,
    // at load time on a tag page, and when opening a minimized composer.
    // WARNING: DON'T SCROLL THE BALLOON INTO VIEW. Only the Text is already
    // there at load time.
    const rectText = $selText[0].getBoundingClientRect();
    const rectLeft = this.left.getBoundingClientRect();
    // https://stackoverflow.com/a/22480938/3567351
    const isPartiallyVisible =
      rectText.top < rectLeft.bottom && rectText.bottom >= rectLeft.top;
    if (!isPartiallyVisible) {
      $selText[0].scrollIntoView();
    }
  }

  //----------------------------------------------------------------------------

  _animateGhost(leftStart, leftEnd, onFinish) {
    if (this.ghost.animate) {
      // Case the browser supports the Web Animation API
      const anim = this.ghost.animate(
        [{ left: leftStart }, { left: leftEnd }],
        { duration: 200 }
      );
      if (onFinish) {
        anim.onfinish = onFinish;
      }
    } else {
      onFinish && onFinish();
    }
  }

  _animateGhostRL(onFinish) {
    const end = isWideScreen() ? '50%' : '0%';
    this._animateGhost('100%', end, onFinish);
  }

  _animateGhostLR() {
    const start = isWideScreen() ? '50%' : '0%';
    this._animateGhost(start, '100%');
  }

  setLayout(newLayout) {
    if (newLayout === this.layout) {
      return
    }

    //afterRender().then(() => {
    switch (this.layout) {
      case null:
      case 1:
        // NONE => ANY
        // RIGHT_ONLY => ANY
        $('html').attr('data-dpg-layout', newLayout);
        break

      case 0:
      case 2:
        if (newLayout === 3) {
          // LEFT_ONLY => SPLIT
          // LEFT_WITH_BAR => SPLIT
          this._animateGhostRL(() => {
            $('html').attr('data-dpg-layout', newLayout);
          });
        } else {
          $('html').attr('data-dpg-layout', newLayout);
        }
        break

      case 3:
        $('html').attr('data-dpg-layout', newLayout);
        if (newLayout === 0 || newLayout === 2) {
          // SPLIT => LEFT_ONLY
          // SPLIT => LEFT_WITH_BAR
          this._animateGhostLR();
        }
        break

      default:
        u.throw();
    }

    // At load time, if we are on mobile layout 3 (right pane only), the
    // scrollIntoView we've just done on the left pane (in _highlightTrigger)
    // failed because the left pane isn't visible. So now that we go to 
    // layout 2 (left pane only), we need to scroll to the selected balloon.
    if (newLayout == 2) {
      const selTrigger = $(this.left).find('.dpg-balloon-text.dpg-highlighted');
      if (selTrigger.length) {
        selTrigger[0].scrollIntoView();
      }
    }

    this.layout = newLayout;
  }

  //----------------------------------------------------------------------------
}

function isWideScreen() {
  return window.innerWidth >= 1035
}

function setWideClass() {
  $('html').toggleClass('dpg-wide', isWideScreen());
}

window.addEventListener('resize', setWideClass);

setWideClass();

const get = url =>
  new Promise((resolve, reject) => {
    $.get(url, data => resolve(data)).fail(() => reject(`get "${url}" failed`));
  });

// Return true if array1 and array2 contain the same elements in the same order
function equals(array1, array2) {
  return (
    array1.length === array2.length &&
    array1.every((value, index) => value === array2[index])
  )
}

function $faIcon({ iconName, title, id = '', classes = '', disabled = false }) {
  const titleStr = title ? `title="${title}"` : '';
  const idStr = id ? `id="${id}"` : '';
  const classesStr = classes || '';
  const disabledStr = disabled ? 'disabled=""' : '';
  return $(`    
    <button ${titleStr} ${idStr} ${disabledStr} class="btn-default btn no-text btn-icon ${classesStr}" type="button">    
      <svg class="fa d-icon d-icon-${iconName} svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
        <use xlink:href="#${iconName}"></use>
      </svg>
    </button>
  `)
}

/*
function parseNextDpgTag({ text, tagName, keys = null, replace = null }) {
  // Find the tag
  const i = text.search(new RegExp(`{${tagName}(\\s+|})`, 'g'))
  if (i === -1) {
    return
  }
  const j = text.indexOf('}', i)
  u.throwIf(i === -1, 'Tailing } not found')

  // extract the properties
  const propsStr = text.substring(i + tagName.length + 1, j)

  // Replace the tag if needed
  if (typeof replace === 'string') {
    text = u.spliceStr(text, i, j - i + 1, replace)
  }

  // Go through the properties
  const pairs = propsStr.split(/\s+/).filter(p => !!p)
  const props = pairs.reduce((res, val) => {
    const pair = val.split('=')
    u.throwIf(
      pair.length !== 2,
      `Invalid DiscPage tag: incorrect property list "${pair}"`
    )
    const key = pair[0]
    u.throwIf(
      !keys || !keys.includes(key),
      `Invalid DiscPage tag: unknown key "${key}"`
    )
    res[key] = pair[1]
    return res
  }, {})

  const missingNum = (keys.length || 0) - Object.keys(props).length
  u.throwIf(missingNum, `Invalid DiscPage tag: ${missingNum} missing key(s)`)

  return { text, props, pos: i }
}
*/

function setFullScreenComposer(mobileView) {
  if (!mobileView) {
    setTimeout(() => {
      $('button.toggle-fullscreen').click();
      setTimeout(() => {
        $('.save-or-cancel').append(
          '<span style="color:#646464">ctrl+enter = submit | esc = exit</span>'
        );
      }, 500);
    }, 500);
  }
}

/*
// Replace the parent
      // Insert the icons: balloon and badge
      // SVG icons: see https://meta.discourse.org/t/introducing-font-awesome-5-and-svg-icons/101643
      parent.wrapInner($('<span class="dpg-balloon-text" />'))
      balloon.remove() // Remove the old markdown balloon
      parent.append(`
        <span class="dpg-icons" title="Click to discuss this part">
          <span class="dpg-balloon">${iconHTML('comment')}</span>
          <div class="dpg-badge" style="display:none"></div>
        </span>
      `)
*/

//------------------------------------------------------------------------------

function onAfterRender(container, pageCats, triggerCats) {
  const appCtrl = container.lookup('controller:application');

  // Add classes to the <html> tag
  let classes = 'dpg';
  //classes += userIsAdmin ? ' dpg-admin' : ' dpg-not-admin'

  // Add a new style sheet for style injection
  // WARNING: don't inject new style in an existing sheet, or you'll get an
  // “The operation is insecure” exception in Firefox
  const style = document.createElement('style');
  document.head.appendChild(style);

  // Hide the 'about' topic of the Page category. This topic is painful because
  // it is automatically created by Discourse, cannot be deleted, and has the Page
  // category (so it will be displayed as a static page)
  pageCats.forEach(pageCat => {
    const aboutTopicId = pageCat['topic_url'].split('/').pop();
    style.sheet.insertRule(
      `html.dpg .category-page .topic-list-item.category-page[data-topic-id="${aboutTopicId}"] { display: none; }`
    );
  });

  // DiscPage does its best to prevent users from using the balloon category 
  // manually.The reason is that the balloon category is supposed to be applied 
  // automatically by DiscPage, when the user creates a new topic in a balloon.
  // So you might think the solution is to use Discourse security features to
  // restrict access to the balloon category. WRONG. If you do this, users
  // won't be able to create topics in this category! So we need to do this 
  // by hand:
  // 1. We'll hide the balloon category from the category combo box in the 
  // “New Topic” dialog.
  // 2. We'll disable the “New Topic” button on the balloon category page.  
  if (triggerCats) {
    classes += ' dpg-hide-balloon-cat';

    triggerCats.forEach(triggerCat => {
      const name = triggerCat['name'];
      const slug = triggerCat['slug'];

      // Hide the balloon category from the category selector (when creating a
      // topic)
      style.sheet.insertRule(
        `html.dpg.dpg-hide-balloon-cat .category-chooser .category-row[data-name="${name}"] { display: none; }`
      );

      // Disable the "New Topic" button and hide the "There are no more Poss
      // topics.Why not create a topic ? " message in the balloon category page.
      const parentCategory = triggerCat['parentCategory'];
      if (parentCategory) {
        const parentSlug = parentCategory['slug'];
        /* FIX FOR ISSUE #24
        style.sheet.insertRule(
          `html.dpg body.category-${parentSlug} button#create-topic { opacity: 0.5; pointer-events: none; }`
        )
        style.sheet.insertRule(
          `html.dpg body.category-${parentSlug} .topic-list-bottom .footer-message { display: none; }`
        )
        */
        style.sheet.insertRule(
          `html.dpg body.category-${parentSlug}-${slug} button#create-topic { opacity: 0.5; pointer-events: none; }`
        );
        style.sheet.insertRule(
          `html.dpg body.category-${parentSlug}-${slug} .topic-list-bottom .footer-message { display: none; }`
        );
      } else {
        style.sheet.insertRule(
          `html.dpg body.category-${slug} button#create-topic { opacity: 0.5; pointer-events: none; }`
        );
        style.sheet.insertRule(
          `html.dpg body.category-${slug} .topic-list-bottom .footer-message { display: none; }`
        );
      }
    });
  }

  if (appCtrl.siteSettings['discpage_hide_sugg_topics']) {
    classes += ' dpg-disable-sugg';
  }
  if (appCtrl.siteSettings['discpage_hide_tags']) {
    classes += ' dpg-hide-tags';
  }

  $('html').addClass(classes);

  $('body').prepend(`
    <div id="dpg-ghost">
      <div class="dpg-ghost-splitbar"></div>
    </div>
    <div id="dpg-container">
      <!-- <div id="dpg-ios-wrapper" tabindex="0"> -->
        <div id="dpg-left" tabindex="0">
          <!--
          <div class="container">
            <div class="loading-container visible ember-view">    
              <div class="spinner "></div>
            </div>      
          </div>                
          -->
        </div>
        <!-- </div> -->
      <div id="dpg-splitbar">
        <div style="flex:1 0 0"></div>
        <div id="dpg-splitbar-text">&gt;</div>
        <div style="flex:1 0 0"></div>
      </div>
    </div>
  `);

  $('#main-outlet-wrapper').wrap('<div id="dpg-right"></div>');

  container.dcsLayout = new DcsLayout(appCtrl, pageCats);

  // Prevent scrolling of the Discourse page (right) when scrolling event on
  // the left reaches top or bottom.
  // Notice that the "scroll" events fires *after* scrolling has been done.
  // How to compute scrollTopMax: https://askcodez.com/comment-obtenir-la-valeur-maximale-du-scrolltop-du-document.html
  function handleScrollUp(e) {
    if (container.dcsLayout.left.scrollTop === 0) {
      e.preventDefault();
    }
  }
  function handleScrollDown(e, scrollDirection) {
    const left = container.dcsLayout.left;
    // -1 is important
    const scrollTopMax = left.scrollHeight - left.clientHeight - 1;
    if (left.scrollTop >= scrollTopMax) {
      e.preventDefault();
    }
  }
  container.dcsLayout.left.addEventListener(
    'wheel',
    e => {
      if (e.deltaY < 0) {
        handleScrollUp(e);
      } else if (e.deltaY > 0) {
        handleScrollDown(e);
      }
    },
    { passive: false } // Passive is true by default on all scroll-related events under Chrome and Firefox
  );
  container.dcsLayout.left.addEventListener('keydown', e => {
    if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
      return
    }
    if (e.code === 'ArrowUp' || e.code === 'PageUp') {
      handleScrollUp(e);
    }
    if (e.code === 'ArrowDown' || e.code === 'PageDown') {
      handleScrollDown(e);
    }
  });

  const router = container.lookup('router:main');

  // Set a click handler on the split bar
  $('#dpg-splitbar').click(function() {
    const showRight = !container.dcsLayout.getShowRightQP();
    router.transitionTo({ queryParams: { ['showRight']: showRight } });
  });

  // Set a click handler on the static page, for deselection
  container.dcsLayout.left.addEventListener('click', e => {
    if (container.dcsLayout.layout === 2 || container.dcsLayout.layout === 3) {
      // Don't deselect in case of ctrl+click or shift+click (useful when user
      // clicks on a link or is selecting text)
      if (e.shiftKey || e.ctrlKey) {
        return
      }

      // Don't deselect when user is selecting text
      if (window.getSelection().toString()) {
        return
      }

      // Don't deselect if user has clicked on an image
      if (e.target.closest('.lightbox-wrapper')) {
        return
      }

      // Don't deselect if user has clicked on a discpage button
      if (e.target.closest('.dpg-buttons')) {
        return
      }

      // Deselect
      router.transitionTo(`/t/${container.dcsLayout.pageId}`);
    }
  });

  function discPageOnOff() {
    $('html').toggleClass('dpg');
  }

  // Click handle for the "DiscPage On/Off" hamburger menu item
  // (not rendered yet at this point in time)
  document.addEventListener('click', e => {
    if (e.target.closest('.dpg-on-off')) {
      discPageOnOff();
    }
  });

  // Set the "alt+a" hotkey for debug display
  // https://stackoverflow.com/a/2879095/3567351
  $(document).keydown(function(e) {
    // Alt+a
    if (e['keyCode'] === 65 && e['altKey']) {
      const user = User.current();
      if (user && user['admin']) {
        discPageOnOff();
      } else {
        u.log(`Only admins can do that`);
      }
    }
  });
}

//import User from 'discourse/models/user'

//------------------------------------------------------------------------------

function onDidTransition({
  container,
  routeName,
  queryParamsOnly,
  pageCatIds,
  triggerCats
}) {
  //console.log('onDidTransition: ', routeName)

  // In case of a topic that is not a Page, we will need to check its tags. But
  // tags are not always there, so we need to wait a bit.

  if (routeName.startsWith('topic.')) {
    // Get the model
    const route = container.lookup('route:topic');
    const model = route.modelFor('topic');

    // Case not a static page
    if (!pageCatIds.includes(model.get('category_id'))) {
      // Wait for the "tags" field. The "tags" field is not always there
      // immediately, especially when creating a new topic
      // 15x200 = 3s total.Tried 1,5s before -> not enough.
      const hasTagsProp = () => model.hasOwnProperty('tags');
      u.async.retryDelay(hasTagsProp, 15, 200).then(
        () => {
          onDidTransition2({
            container,
            routeName,
            queryParamsOnly,
            pageCatIds,
            triggerCats
          });
        },
        () => {
          // Property "tags" not found in topic model'. This happens when topic
          // has no tags. Show the normal Discourse.
          container.dcsLayout.setLayout(1);
        }
      );

      return
    }
  }

  onDidTransition2({
    container,
    routeName,
    queryParamsOnly,
    pageCatIds,
    triggerCats
  });
}

function onDidTransition2({
  container,
  routeName,
  queryParamsOnly,
  pageCatIds,
  triggerCats
}) {
  //console.log('onDidTransition2: ', routeName)

  const $html = $('html');
  $html.removeClass('dpg-page dpg-tag dpg-topic dpg-comment dpg-discuss');
  $html.removeAttr('data-dpg-page-id');

  //**** topic route ****
  if (routeName.startsWith('topic.')) {
    const route = container.lookup('route:topic');
    const model = route['currentModel'];

    // Case static Page
    if (pageCatIds.includes(model.get('category_id'))) {
      $html.addClass(`dpg-page`);
      $html.attr('data-dpg-page-id', model.get('id'));
      return
    }

    // Check the tags
    const tags = model.get('tags') || [];
    let parsed;
    const dpgTag = tags.find(tag => {
      parsed = DpgTag.parse(tag);
      return !!parsed
    });

    // Case topic of a trigger
    if (dpgTag) {
      const { pageId, triggerId } = parsed;
      const layout = container.dcsLayout.getShowRightQP() ? 3 : 2;
      container.dcsLayout.fillLeft({ pageId, selTriggerId: triggerId });
      const isCommentMode = false;
      const modeClass = 'dpg-discuss';
      $html.addClass(`dpg-topic ${modeClass}`);
      $html.attr('data-dpg-page-id', pageId);
      if (!queryParamsOnly) {
        afterRender().then(() => modifyTopicPage(dpgTag, isCommentMode));
      }
      container.dcsLayout.setLayout(layout);
      return
    }
  }

  //**** Tag route ****
  if (routeName === 'tag.show') {
    const route = container.lookup('route:tag.show');
    const model = route['currentModel'];
    const parsed = DpgTag.parse(model['tag']['id']);
    if (parsed) {
      const isCommentMode = false; //model.get('id') === 'dpg-comment'
      const modeClass = 'dpg-discuss';
      $html.addClass(`dpg-tag ${modeClass}`);
      $html.attr('data-dpg-page-id', parsed.pageId);

      if (!queryParamsOnly) {
        // Create the static page view
        container.dcsLayout.fillLeft({
          pageId: parsed.pageId,
          selTriggerId: parsed.triggerId
        });

        // Set the right category in the composer
        if (triggerCats) {
          const tagsShowCtrl = container.lookup('controller:tag-show');
          if (triggerCats.length === 1) {
            tagsShowCtrl.set('category', triggerCats[0]);
            tagsShowCtrl.set('canCreateTopicOnCategory', true);
          } else {
            // Case there are more than one category to choose from: we will
            // pick the one "closest" to the page category
            get$1(`/t/${parsed.pageId}.json`).then(topic => {
              // Get the page category
              const pageCatId = topic['category_id'];
              const appCtrl = container.lookup('controller:application');
              const pageCat = appCtrl.site.categories.find(
                c => c['id'] === pageCatId
              );
              const pageParentCatId = pageCat['parent_category_id'];

              // Choose a balloon category in the list. Take the first category
              // in the list which is either:
              // - a sibling of the page category (same immediate parent)
              // - the immediate parent of the page category
              // If not found, take the first category.
              const triggerCat =
                (pageParentCatId &&
                  triggerCats.find(
                    tc =>
                      tc['parent_category_id'] === pageParentCatId ||
                      tc['id'] === pageParentCatId
                  )) ||
                triggerCats[0];

              // set the category in the composer
              tagsShowCtrl.set('category', triggerCat);
              tagsShowCtrl.set('canCreateTopicOnCategory', true);
            });
          }
        }

        afterRender().then(() => modifyTagPage(isCommentMode));
      }
      const layout = container.dcsLayout.getShowRightQP() ? 3 : 2;
      container.dcsLayout.setLayout(layout);

      return
    }
  }

  //**** Other routes ****
  container.dcsLayout.setLayout(1);
}

//------------------------------------------------------------------------------

function modifyTagPage(commentMode) {
  // Change the "New Topic" button to "New Comment"
  if (commentMode) {
    $('#create-topic > .d-button-label').text('New Comment');
  }

  // If there is no topic in the tag, display "No topic yet", else remove the
  // useless message when there are too few topics: "There are no latest
  // topics.Browse all categories or view latest topics"
  const footer = $('footer.topic-list-bottom');
  const noTopic = !$('table.topic-list').length;
  if (noTopic) {
    footer.html(`
      <div style="margin-left:12px">
        <p><i>No ${commentMode ? 'comment' : 'topic'} yet</i></p>
      </div>
    `);
  } else {
    footer.html('');
  }
}

//------------------------------------------------------------------------------

function modifyTopicPage(dpgTag, commentMode) {
  if (commentMode) ; else {
    // Add the "back" link
    // WARNING: if we already were on a dcs topic page, the "back"
    // link is already there. This happens when using the "Suggested Topics" list
    // at the bottom on a topic (admin mode only, I think)
    if (!$('#dpg-back').length) {

      $('#topic-title .title-wrapper').append(`
        <div id="dpg-back">
          <a href="/tag/${dpgTag}">
            &#8630; Back to topic list
          </a>
        </div>
      `);

      /*
      $('#main-outlet > .ember-view[class*="category-"]').prepend(`
        <div id="dpg-back" class="list-controls" style="position:-webkit-sticky; position:sticky; top:70px; z-index:1000; text-align:right; margin-bottom:-10px">
          <div class="container">
            <a style="padding:5px; background-color:white" href="/tag/${dpgTag}">
              &#8630; Back to topic list
            </a>
          </div>
        </div>
      `)
      */
    }
  }
}

//------------------------------------------------------------------------------

/*
// CAREFUL: when redirecting a route change (for example within willTransition),
// always use the same method as the original transition, otherwise strange bugs
// occur. For example, if in a transitionTo() you redirect with replaceWith(),
// you erase the previous entry in the browser history !
function redirect(container, transition, ...args) {
  // Don't use transition.router here, it is wrong (or not the right one)
  const router = container.lookup('router:main')
  const fun =
    transition.urlMethod === 'replace'
      ? router.replaceWith
      : router.transitionTo
  return fun.bind(router)(...args)
}
*/
//------------------------------------------------------------------------------

const afterRender = res =>
  new Promise(resolve => {
    Ember.run.schedule('afterRender', null, () => resolve(res));
  });

const get$1 = url =>
  new Promise((resolve, reject) => {
    $.get(url, data => resolve(data)).fail(() => reject(`get "${url}" failed`));
  });

//------------------------------------------------------------------------------

//------------------------------------------------------------------------------

/**
 * @param {EmberContainer} container
 * @param {EmberApplication} app
 */
function init(container, app) {
  const siteSettings = container.lookup('site-settings:main');

  //----------------------------------------------------------------------------

  const user = User.current();
  const userIsAdmin = user && user['admin'];

  //----------------------------------------------------------------------------

  // If plugin is disabled, quit
  if (!siteSettings['discpage_enabled']) {
    return
  }

  //----------------------------------------------------------------------------

  // Fix for issue #17
  // If we are in "login required" mode but the user is not logged-in yet, quit.
  // Indeed, at this stage we don't have access to categories, etc., so we'll
  // wait until the user has logged in to really launch DiscPage.
  if (siteSettings['login_required'] && !user) {
    return
  }

  //----------------------------------------------------------------------------

  // Check the tagging_enabled setting
  if (!siteSettings['tagging_enabled']) {
    settingError('tagging_enabled', 'this must be set to true');
    return
  }

  // Check the discpage_page_categories setting
  if (!siteSettings['discpage_page_categories']) {
    settingError('discpage_page_categories', 'missing setting');
    return
  }
  const pageCatIds = siteSettings['discpage_page_categories']
    .split('|')
    .map(str => parseInt(str));
  const appCtrl = container.lookup('controller:application');
  let error = false;
  const pageCats = pageCatIds.reduce((res, id) => {
    const cat = appCtrl.site.categories.find(c => c['id'] === id);
    if (cat) {
      res.push(cat);
    } else {
      // Maybe the category has not been found because the user is not allowed
      // to see it. Only with admins are we sure there's an error. For other
      // users, it might be normal.
      if (userIsAdmin) {
        settingError(
          'discpage_page_categories',
          `category "${id}" not found. Please reset this setting and add your category(ies) again`
        );
        error = true;
      }
    }
    return res
  }, []);
  if (error) {
    return
  }

  // Check the discpage_balloon_category setting
  const triggerCatIds = appCtrl.siteSettings['discpage_balloon_category'];
  error = false;
  const triggerCats =
    triggerCatIds &&
    triggerCatIds.split('|').reduce((res, idStr) => {
      const id = parseInt(idStr);
      const cat = appCtrl.site.categories.find(c => c['id'] === id);
      if (cat) {
        res.push(cat);
      } else {
        // Maybe the category has not been found because the user is not allowed
        // to see it. Only with admins are we sure there's an error. For other
        // users, it might be normal.
        if (userIsAdmin) {
          settingError(
            'discpage_balloon_category',
            `category "${id}" not found. Please reset this setting and add your category(ies) again`
          );
          error = true;
        }
      }
      return res
    }, []);
  if (error) {
    return
  }

  //----------------------------------------------------------------------------

  /*
  // Disable the header title replacement when scrolling down a topic
  // https://github.com/discourse/discourse/blob/162413862c7561207964a685b9ab2ff392cb8582/app/assets/javascripts/discourse/components/site-header.js.es6#L45
  
  NO, THE DEFAULT BEHAVIOR IS BETTER
  People can still do it, though. See:
  https://meta.discourse.org/t/is-it-possible-to-disable-topic-title-in-header/75502/2

  SiteHeaderComponent.reopen({
    ['setTopic'](topic) {
      // Do nothing
    }
  })
  */

  //----------------------------------------------------------------------------

  // Wait until the page is rendered, then modify some stuff in the page
  // DO THIS FIRST, SO ANYONE TRIGGERING AN ERROR FROM HERE CAN DISPLAY THE
  // ERROR IN THE IFRAME (we want to be the first afterRender(), so that
  // subsequent afterRender() can find an existing iframe)
  afterRender$1().then(() => {
    onAfterRender(container, pageCats, triggerCats);
  });

  //----------------------------------------------------------------------------

  // Add the 'r' query param. This query param is used only with routes
  // 'tag.show' and 'topic.*'
  // Starting on updated Discourse dev (10/01/2018),
  // use container.lookup('controller:application') instead of
  //ApplicationController, or it doesn't work
  container.lookup('controller:application').reopen({
    queryParams: { ['showRight']: 'r' },
    ['showRight']: true
  });

  //----------------------------------------------------------------------------

  /*
  container.lookup('controller:topic').reopen({
    changed1: Ember.observer('model.category_id', function () {
      const model = this.get('model')
      console.log('model: ', model);
      if (model.category_id === pageCategoryId) {
        container.dcsLayout.fillLeft(model.id.toString())
        container.dcsLayout.setLayout(0)  
      }
    }),
    changed2: Ember.observer('model.tags', function() {
      console.log('tags have changed: ', this.get('model.tags'))
    }),    
  })
  */

  //----------------------------------------------------------------------------

  let lastUrl = '';
  //let shrinkComposer = true
  withPluginApi('0.8.30', api => {
    // Disable the "show topic title in header"
    // https://meta.discourse.org/t/hiding-topic-title-in-header/118268
    api.modifyClass('component:discourse-topic', {
      ['shouldShowTopicInHeader'](topic, offset) {
        return false
        //return $('html').hasClass('dpg-wide') ? false : this._super(topic, offset)
      }
    });

    /*
    // TO FIND EVENTS, DOWNLOAD THE DISCOURSE SOURCE CODE AND SEARCH FOR:
    // .appEvents.trigger("topic:
    api.onAppEvent('topic:created', (createdPost, composer) => {
      console.log('composer: ', composer);
      console.log('createdPost: ', createdPost);
    })
    api.onAppEvent('composer:insert-text', () => {
      console.log('composer: ', arguments);
    })
    api.onAppEvent('header:update-topic', topic => {
      console.log('header:update-topic: ', topic, topic.category_id, topic.category && topic.category.name)
    })
    */

    if (userIsAdmin) {
      api.decorateWidget('hamburger-menu:footerLinks', () => ({
        ['href']: undefined,
        ['rawLabel']: 'DiscPage On/Off',
        ['className']: 'dpg-on-off'
      }));
    }

    // THIS IS A HACK, WE NEED TO DO BETTER THAN THIS
    // We need to store a decoratorHelper somewhere at the very beginning in
    // order to generate cook posts in static pages
    api.decorateWidget('header:before', helper => {
      afterRender$1().then(() => {
        container.dcsLayout.decoratorHelper = helper;

        // FIX FOR ISSUE #19
        // This is a nasty hack: the Checklist plugin needs the post model, so
        // we create a dummy one and we disable editing. See:
        // https://github.com/discourse/discourse-checklist/blob/master/assets/javascripts/discourse/initializers/checklist.js.es6#L23
        // In the future, we'll need to find a better fix, because any plugin
        // relying on the post model will fail.
        container.dcsLayout.decoratorHelper['widget']['model'] = {
          ['can_edit']: false
        };
      });
    });

    // This is called each time a topic is about to be rendered. We generate
    // static page content here, not in the 'page:changed' event. The reason is
    // that 'page:changed' event is not called after a topic has been edited
    // and reloads.
    // Also, don't use api.decorateCooked(), because it is called with the
    // "cooked + decorated" version of the post, which is useless because we
    // cannot add decorators on an already (wrongly) decorated post.
    // https://meta.discourse.org/t/how-do-we-fire-scripts-after-topic-html-is-rendered-in-dom/114701
    // https://github.com/discourse/discourse/blob/690db4fd361cc08f54ea2a4fa2352bf99d1287ef/app/assets/javascripts/discourse/widgets/post-cooked.js.es6#L46
    api.decorateWidget('post:after', helper => {
      const attrs = helper['attrs'];

      // We only consider the main post of a topic
      if (!attrs['firstPost']) {
        return
      }

      // Look for topics with the 'Page' category
      const catNames = $('#topic-title .category-name')
        .map((i, el) => el.innerText)
        .get();
      if (pageCats.find(cat => catNames.includes(cat['name']))) {
        // Wait for container.dcsLayout to be ready
        afterRender$1().then(() => {
          container.dcsLayout.fillLeft({
            pageId: attrs['topicId'].toString(),
            postId: attrs['id'],
            lastRevNum: attrs['version'],
            cooked: attrs['cooked'],
            title: $('.fancy-title').text().trim()
          });
          container.dcsLayout.setLayout(0);
        });
      }
    });

    // Page changed event
    // See also: https://github.com/discourse/discourse/blob/master/app/assets/javascripts/discourse/initializers/page-tracking.js.es6#L15
    // To get a list of event, search for "appEvents.trigger" in GitHub
    api.onAppEvent(
      'page:changed',
      ({
        ['currentRouteName']: currentRouteName,
        ['title']: title,
        ['url']: url
      }) => {
        // Yes, this happens, at least in dev mode
        if (url === lastUrl) {
          return
        }

        // See if only query params have changed
        const queryParamsOnly = url.split('?')[0] === lastUrl.split('?')[0];
        lastUrl = url;

        // Log route change
        /*
        u.log(
          `Discourse page changed to "${currentRouteName}"${
            queryParamsOnly ? ' (only queryParams)' : ''
          }`
        )
        */

        // Handle the transition
        onDidTransition({
          container,
          routeName: currentRouteName,
          queryParamsOnly,
          pageCatIds,
          triggerCats
        });

        // Collapse the composer, because after changing route, the current draft
        // might not relate to the current balloon anymore. See below for
        // the part where we change the route back to the appropriate tag when
        // reopening the composer.
        /*
        if (shrinkComposer) {
          container.lookup('controller:composer').shrink()
        }
        shrinkComposer = true
        */
      }
    );
  });

  //----------------------------------------------------------------------------

  TopicNavigationComponent.reopen({
    // The topic-navigation component is responsible for displaying either a
    // vertical timeline (on large screens) or a small horizontal gauge (on
    // small screens).See this code:
    // https://github.com/discourse/discourse/blob/master/app/assets/javascripts/discourse/app/components/topic-navigation.js#L38
    // This code fails because it performs a computation based on the window
    // width instead of #main-outlet width. We need to fix this, otherwise the
    // vertical timeline is displayed out of the window area on the right.
    // In the past, we used to do the same in DcsLayout.js by forcing the
    // mobile view like this:
    // this.appCtrl.site.set('mobileView', this.saveMobileView || newLayout === 2 || newLayout === 3)
    // IT DOESN'T WORK WELL! Forcing mobileView=true has side effects, such as
    // disabling the fullscreen button.
    ['_performCheckSize']() {
      this._super();
      // THIS DOESN'T WORK AT LOAD TIME, because $('#main-outlet').width() is 
      // not set yet. See below for a fix to this issue.
      if ($('#main-outlet').width() <= 1005 /* 924 */) {
        this.info['setProperties']({ ['renderTimeline']: false });
      }
    },

    ['didInsertElement']() {
      this._super(...arguments);

      // At load time, we need to wait for the DiscPage layout to be applied
      // and check the size again, otherwise the initial size check is wrong
      this.observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === 'class') {
            if (mutation.target.classList.contains('dpg-topic')) {
              // We would love to call  _checkSize() here instead of _performCheckSize(), as it is debounced. See:
              // https://github.com/discourse/discourse/blob/main/app/assets/javascripts/discourse/app/components/topic-navigation.js#L67
              // But if we do it, at init time, the original _performCheckSize() 
              // is called instead of our modified one.
              this['_performCheckSize']();
            }
          }
        });
      });
      this.observer.observe(document.documentElement, { attributes: true });
    },

    ['willDestroyElement']() {
      this.observer.disconnect();
      this._super(...arguments);
    }
  });

  //----------------------------------------------------------------------------

  /*
  TopicProgressComponent.reopen({
    ['_setupObserver']() {
      //this._super()
      console.log('gfeyugfzeyugezfyu');

      const bottomIntersectionMargin =
        document.querySelector("#reply-control")?.clientHeight || 50;

      return new IntersectionObserver(this._intersectionHandler, {
        threshold: 1,
        rootMargin: `0px 0px -${bottomIntersectionMargin}px 50%`
        //root: document.querySelector("#main-outlet")
      });            
    }
  })
  */

  //----------------------------------------------------------------------------

  /*
  ComposerController.reopen({
    composeStateChanged: Ember.observer('model.composeState', function() {
      // Get the composer state
      const state = this.get('model.composeState')
      
      // We are going to do something when the composer opens
      if (state === Composer.OPEN) {
        // Cases that are interesting for us:
        // - When the composer opens as "New Topic" on a DiscPage tag, in which
        // case model.tags will contain a dpg tags
        // - When the composer opens as "New Reply" on a DiscPage topic, in which
        // case model.topic.tags will contain a dpg tags
        const tags = this.get('model.tags') || this.get('model.topic.tags')
        let parsed
        const dpgTag =
          tags &&
          tags.find(t => {
            parsed = DpgTag.parse(t)
            return !!parsed
          })
        if (!dpgTag) {
          return
        }

        // When opening (sliding up) the composer with a dpgTag, redirect to the
        // appropriate route
        const topic = this.get('model.topic')
        const path = topic
          ? `/t/${topic.get('slug')}/${topic.get('id')}?r=true`
          : `/tag/${dpgTag}?r=true`
        shrinkComposer = false
        container.lookup('router:main').transitionTo(path)

        return
      }
    })
  })
  */

  //----------------------------------------------------------------------------

  ApplicationRoute.reopen({
    // Watch topic states
    // messageCount is the message index that changes whenever a new state
    // message is sent. It doesn't mean something as changed, though: a new
    // message is always sent when there's a route change.
    topicStateChanged: Ember.observer(
      'topicTrackingState.messageCount',
      function() {
        /*
        const appCtrl = this.controllerFor('application')
        const topicStates = appCtrl['topicTrackingState']['states']
        console.log('topicStates: ', appCtrl['topicTrackingState']);
        const res = simplifyTopicStates(topicStates)
        if (res.length) {
          console.log('topicStateChanged: ', res)
        }
        */
      }
    )
  });

  //----------------------------------------------------------------------------
}

const afterRender$1 = res =>
  new Promise(resolve => {
    // @ts-ignore
    Ember.run.schedule('afterRender', null, () => resolve(res));
  });

function settingError(setting, msg) {
  u.logError(
    `Invalid Discourse setting "${setting.replace(/_/g, ' ')}": ${msg}`
  );
}

export { init };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGliLmpzLmVzNiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vZGlzY3BhZ2Utc3JjL3NyYy91dGlscy5qcyIsIi4uLy4uLy4uLy4uLy4uL2Rpc2NwYWdlLXNyYy9zcmMvRHBnVGFnLmpzIiwiLi4vLi4vLi4vLi4vLi4vZGlzY3BhZ2Utc3JjL3NyYy9kaXNjb3Vyc2VBUEkuanMiLCIuLi8uLi8uLi8uLi8uLi9kaXNjcGFnZS1zcmMvc3JjL0Rjc0xheW91dC5qcyIsIi4uLy4uLy4uLy4uLy4uL2Rpc2NwYWdlLXNyYy9zcmMvb25BZnRlclJlbmRlci5qcyIsIi4uLy4uLy4uLy4uLy4uL2Rpc2NwYWdlLXNyYy9zcmMvb25EaWRUcmFuc2l0aW9uLmpzIiwiLi4vLi4vLi4vLi4vLi4vZGlzY3BhZ2Utc3JjL3NyYy9pbml0aWFsaXplLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgY29uc3QgdSA9IHt9XHJcblxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxudS5sb2cgPSAoLi4uYXJncykgPT4ge1xyXG4gIGFyZ3MgPSBbYCVjRGlzY1BhZ2UgLWAsICdjb2xvcjpncmV5JywgLi4uYXJnc11cclxuICBjb25zb2xlLmxvZyguLi5hcmdzKVxyXG59XHJcblxyXG51LmxvZ0Vycm9yID0gKC4uLmFyZ3MpID0+IHtcclxuICBhcmdzID0gW2AlY0Rpc2NQYWdlIEVycm9yIC1gLCAnY29sb3I6cmVkJywgLi4uYXJnc11cclxuICBjb25zb2xlLmxvZyguLi5hcmdzKVxyXG59XHJcblxyXG51LmxvZ1dhcm5pbmcgPSAoLi4uYXJncykgPT4ge1xyXG4gIGFyZ3MgPSBbYCVjRGlzY1BhZ2UgV2FybmluZyAtYCwgJ2NvbG9yOm9yYW5nZScsIC4uLmFyZ3NdXHJcbiAgY29uc29sZS5sb2coLi4uYXJncylcclxufVxyXG5cclxuLypcclxuLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNjIzNDc3My9jYW4taS1lc2NhcGUtaHRtbC1zcGVjaWFsLWNoYXJzLWluLWphdmFzY3JpcHRcclxudS5lc2NhcGVIdG1sID0gdW5zYWZlID0+XHJcbiAgdW5zYWZlICYmXHJcbiAgdW5zYWZlXHJcbiAgICAucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxyXG4gICAgLnJlcGxhY2UoLzwvZywgJyZsdDsnKVxyXG4gICAgLnJlcGxhY2UoLz4vZywgJyZndDsnKVxyXG4gICAgLnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxyXG4gICAgLnJlcGxhY2UoLycvZywgJyZhcG9zOycpXHJcbiovXHJcbi8vIFNlZSBodHRwczovL21lZGl1bS5jb20vQHhwbC9qYXZhc2NyaXB0LWRlcml2aW5nLWZyb20tZXJyb3ItcHJvcGVybHktOGQyZjhmMzE1ODAxXHJcbnUuRGlzY3BhZ2VFcnJvciA9IGNsYXNzIGV4dGVuZHMgRXJyb3Ige1xyXG4gIGNvbnN0cnVjdG9yKG1zZykge1xyXG4gICAgc3VwZXIobXNnKVxyXG4gICAgdGhpcy5jb25zdHJ1Y3RvciA9IHUuRGlzY3BhZ2VFcnJvclxyXG4gICAgdGhpcy5fX3Byb3RvX18gPSB1LkRpc2NwYWdlRXJyb3IucHJvdG90eXBlXHJcbiAgICB0aGlzLm1lc3NhZ2UgPSBtc2dcclxuICAgIHRoaXMubmFtZSA9ICdEaXNjcGFnZUVycm9yJ1xyXG4gIH1cclxufVxyXG5cclxudS50aHJvdyA9IG1zZyA9PiB7XHJcbiAgdGhyb3cgbmV3IHUuRGlzY3BhZ2VFcnJvcihtc2cpXHJcbn1cclxuXHJcbnUudGhyb3dJZiA9IChjb25kLCBtc2cpID0+IGNvbmQgJiYgdS50aHJvdyhtc2cpXHJcbnUudGhyb3dJZk5vdCA9IChjb25kLCBtc2cpID0+ICFjb25kICYmIHUudGhyb3cobXNnKVxyXG5cclxuLy8gRnVuY3Rpb25zIGZyb20gdGhlIFwiZGV2XCIgZmllbGQgbWlnaHQgYmUgc3RyaXBlZCBvdXQgb2YgcHJvZHVjdGlvbiBjb2RlXHJcbnUuZGV2ID0ge1xyXG4gIGFzc2VydDogKGNvbmQsIG1zZykgPT5cclxuICAgIHUudGhyb3dJZighY29uZCwgYEFzc2VydGlvbiBGYWlsZWQke21zZyA/ICcgLSAnICsgbXNnIDogJyd9YCksXHJcbiAgbG9nOiB1LmxvZyxcclxuICBsb2dXYXJuaW5nOiB1LmxvZ1dhcm5pbmcsXHJcbiAgbG9nRXJyb3I6IHUubG9nRXJyb3JcclxufVxyXG5cclxuLy8gUmV0dXJuIHRydWUgaWYgd2UgYXJlIGluIGFuIGlmcmFtZVxyXG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzI2MDc2LzM1NjczNTFcclxudS5pbklGcmFtZSA9ICgpID0+IHtcclxuICB0cnkge1xyXG4gICAgcmV0dXJuIHdpbmRvdy5zZWxmICE9PSB3aW5kb3cudG9wXHJcbiAgfSBjYXRjaCAoZSkge1xyXG4gICAgcmV0dXJuIHRydWVcclxuICB9XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vKlxyXG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNDE1MzI0MTUvMzU2NzM1MVxyXG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy82MzkzOTQzL2NvbnZlcnQtamF2YXNjcmlwdC1zdHJpbmctaW4tZG90LW5vdGF0aW9uLWludG8tYW4tb2JqZWN0LXJlZmVyZW5jZS82Mzk0MTY4IzYzOTQxNjhcclxuXHJcbnUuZ2V0ID0gZnVuY3Rpb24ob2JqLCBmaWVsZE5hbWVEb3ROb3RhdGlvbikge1xyXG4gIHJldHVybiBmaWVsZE5hbWVEb3ROb3RhdGlvbi5zcGxpdCgnLicpLnJlZHVjZSgobywgaSkgPT4gb1tpXSwgb2JqKVxyXG59XHJcbiovXHJcblxyXG4vKlxyXG51LnBpY2sgPSAobywga2V5cykgPT5cclxuICBvXHJcbiAgICA/IGtleXMucmVkdWNlKChyZXMsIGtleSkgPT4ge1xyXG4gICAgICAgIGlmIChvLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIHJlc1trZXldID0gb1trZXldXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXNcclxuICAgICAgfSwge30pXHJcbiAgICA6IG9cclxuXHJcbnUub21pdCA9IChvLCBrZXlzKSA9PlxyXG4gIG9cclxuICAgID8gT2JqZWN0LmtleXMobykucmVkdWNlKChyZXMsIGtleSkgPT4ge1xyXG4gICAgICAgIGlmICgha2V5cy5pbmNsdWRlcyhrZXkpKSB7XHJcbiAgICAgICAgICByZXNba2V5XSA9IG9ba2V5XVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzXHJcbiAgICAgIH0sIHt9KVxyXG4gICAgOiBvXHJcbiovXHJcblxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vKlxyXG4vLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMjY1MTI1LzM1NjczNTFcclxuLy8gaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzI2MTI3NjQ3LzM1NjczNTFcclxuY29uc3QgYyA9IGRvY3VtZW50LmNvb2tpZVxyXG5jb25zb2xlLmxvZygnYzogJywgYylcclxuY29uc3QgbG9hZGVkRnJvbUJyb3dzZXJDYWNoZSA9IGMuaW5jbHVkZXMoJ2xvYWRlZEZyb21Ccm93c2VyQ2FjaGU9ZmFsc2UnKVxyXG4gID8gZmFsc2VcclxuICA6IGMuaW5jbHVkZXMoJ2xvYWRlZEZyb21Ccm93c2VyQ2FjaGU9dHJ1ZScpID8gdHJ1ZSA6IHVuZGVmaW5lZFxyXG5kb2N1bWVudC5jb29raWUgPSAnbG9hZGVkRnJvbUJyb3dzZXJDYWNoZT10cnVlJ1xyXG5cclxuLy8gUmV0dXJuIHRydWUgaWYgdGhlIGN1cnJlbnQgcGFnZSBoYXMgYmVlbiBsb2FkZWQgZnJvbSB0aGUgYnJvd3NlciBjYWNoZVxyXG51LmxvYWRlZEZyb21Ccm93c2VyQ2FjaGUgPSAoKSA9PiB7XHJcbiAgdS50aHJvd0lmKFxyXG4gICAgbG9hZGVkRnJvbUJyb3dzZXJDYWNoZSA9PT0gdW5kZWZpbmVkLFxyXG4gICAgJ01pc3NpbmcgY29va2llIFwibG9hZGVkRnJvbUJyb3dzZXJDYWNoZVwiLiBDaGVjayB5b3VyIHNlcnZlci4nXHJcbiAgKVxyXG4gIHJldHVybiBsb2FkZWRGcm9tQnJvd3NlckNhY2hlXHJcbn1cclxuKi9cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbi8qXHJcbi8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zMTk5MTg3MC8zNTY3MzUxXHJcbi8vIE5vdGljZSB0aGF0IHRoZSBucG0gcGFja2FnZXMgaXMtYWJzb2x1dGUtdXJsIGFuZCBpcy1yZWxhdGl2ZS11cmwgZmFpbCBmb3JcclxuLy8gdXJsIG9mIHR5cGUgLy9nb29nbGUuY29tL2JsYWJsYWJsYVxyXG5jb25zdCBhYnNvbHV0ZVVybFJlZ2V4ID0gLyg/Ol5bYS16XVthLXowLTkrLi1dKjp8XFwvXFwvKS9pXHJcbmRjc1F1ZXJ5LmlzQWJzb2x1dGVVcmwgPSB1cmwgPT4gYWJzb2x1dGVVcmxSZWdleC50ZXN0KHVybClcclxuKi9cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbi8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS80MzE0MDUwXHJcbnUuc3BsaWNlU3RyID0gKHN0ciwgc3RhcnQsIGRlbENvdW50LCBpbnNlcnRTdHIpID0+XHJcbiAgc3RyLnNsaWNlKDAsIHN0YXJ0KSArIGluc2VydFN0ciArIHN0ci5zbGljZShzdGFydCArIE1hdGguYWJzKGRlbENvdW50KSlcclxuXHJcbnUuYXN5bmMgPSB7XHJcbiAgLy8gTGlrZSB0aGUgc3RhbmRhcmQgXCJmb3JFYWNoXCIgZnVuY3Rpb24sIGJ1dCB0aGUgY2FsbGJhY2sgY2FuIHJldHVybiBhIHByb21pc2VcclxuICAvLyB0byB3YWl0IGZvciBiZWZvcmUgaXRlcmF0aW5nLiBVc2Ugb25seSBhcmd1bWVudHMgMSBhbmQgMiAob3RoZXJzXHJcbiAgLy8gIGFyZSB1c2VkIGludGVybmFsbHkpLiBTZWUgaHR0cHM6Ly9zdGFja292ZXJmbG93LmNvbS9hLzQ2Mjk1MDQ5LzI4NjY4NVxyXG4gIGZvckVhY2goYXJyLCBmbiwgYnVzeSwgZXJyLCBpID0gMCkge1xyXG4gICAgY29uc3QgYm9keSA9IChvaywgZXIpID0+IHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByID0gZm4oYXJyW2ldLCBpLCBhcnIpXHJcbiAgICAgICAgciAmJiByLnRoZW4gPyByLnRoZW4ob2spLmNhdGNoKGVyKSA6IG9rKHIpXHJcbiAgICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgICBlcihlKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBjb25zdCBuZXh0ID0gKG9rLCBlcikgPT4gKCkgPT4gdS5hc3luYy5mb3JFYWNoKGFyciwgZm4sIG9rLCBlciwgKytpKVxyXG4gICAgY29uc3QgcnVuID0gKG9rLCBlcikgPT5cclxuICAgICAgaSA8IGFyci5sZW5ndGggPyBuZXcgUHJvbWlzZShib2R5KS50aGVuKG5leHQob2ssIGVyKSkuY2F0Y2goZXIpIDogb2soKVxyXG4gICAgcmV0dXJuIGJ1c3kgPyBydW4oYnVzeSwgZXJyKSA6IG5ldyBQcm9taXNlKHJ1bilcclxuICB9LFxyXG5cclxuICAvLyBDcmVhdGUgYSBwcm9taXNlIHdpdGggMiBhZGRpdGlvbmFsIGZ1bmN0aW9ucyAocmVzb2x2ZSBhbmQgcmVqZWN0KSBhbmQgb25lXHJcbiAgLy8gYWRkaXRpb24gKHN0YXRlKVxyXG4gIC8vIGNyZWF0ZWZ1bjogb3B0aW9uYWwsIHRoZSB1c3VhbCBwcm9taXNlIGNyZWF0aW9uIGZ1bmN0aW9uIC0+IChyZXNvbHZlLCByZWplY3QpID0+IHsgLi4uIH1cclxuICBjcmVhdGVQcm9taXNlKGNyZWF0ZWZ1bikge1xyXG4gICAgLy8gQ3JlYXRlIHRoZSBwcm9taXNlXHJcbiAgICBsZXQgb3JpZ2luYWxSZXNvbHZlLCBvcmlnaW5hbFJlamVjdFxyXG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgb3JpZ2luYWxSZXNvbHZlID0gcmVzb2x2ZVxyXG4gICAgICBvcmlnaW5hbFJlamVjdCA9IHJlamVjdFxyXG4gICAgfSlcclxuXHJcbiAgICAvLyBFbnJpY2hlZCB0aGUgcHJvbWlzZVxyXG4gICAgcHJvbWlzZS5zdGF0ZSA9ICdwZW5kaW5nJ1xyXG4gICAgcHJvbWlzZS5yZXNvbHZlID0gdmFsdWUgPT4ge1xyXG4gICAgICBvcmlnaW5hbFJlc29sdmUodmFsdWUpXHJcbiAgICAgIGlmIChwcm9taXNlLnN0YXRlID09PSAncGVuZGluZycpIHtcclxuICAgICAgICBwcm9taXNlLnN0YXRlID0gJ3Jlc29sdmVkJ1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICBwcm9taXNlLnJlamVjdCA9IHZhbHVlID0+IHtcclxuICAgICAgb3JpZ2luYWxSZWplY3QodmFsdWUpXHJcbiAgICAgIGlmIChwcm9taXNlLnN0YXRlID09PSAncGVuZGluZycpIHtcclxuICAgICAgICBwcm9taXNlLnN0YXRlID0gJ3JlamVjdGVkJ1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2FsbCB0aGUgb3JpZ2luYWwgY3JlYXRpb24gZnVuY3Rpb24gKGlmIGFueSlcclxuICAgIGNyZWF0ZWZ1biAmJiBjcmVhdGVmdW4ocHJvbWlzZS5yZXNvbHZlLCBwcm9taXNlLnJlamVjdClcclxuXHJcbiAgICByZXR1cm4gcHJvbWlzZVxyXG4gIH0sXHJcblxyXG4gIC8vIFVzZSBsaWtlIHRoaXM6XHJcbiAgLy8gdS5hc3luYy5wcm9taXNlU3RhdGUoYSkudGhlbihzdGF0ZSA9PiBjb25zb2xlLmxvZyhzdGF0ZSkpOyAvLyBPdXRwdXQ6IGZ1bGZpbGxlZCB8IHJlamVjdGVkIHwgcGVuZGluZ1xyXG4gIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zNTgyMDIyMC8zNTY3MzUxXHJcbiAgcHJvbWlzZVN0YXRlKHApIHtcclxuICAgIGNvbnN0IHQgPSB7fVxyXG4gICAgcmV0dXJuIFByb21pc2UucmFjZShbcCwgdF0pLnRoZW4oXHJcbiAgICAgIHYgPT4gKHYgPT09IHQgPyAncGVuZGluZycgOiAnZnVsZmlsbGVkJyksXHJcbiAgICAgICgpID0+ICdyZWplY3RlZCdcclxuICAgIClcclxuICB9LFxyXG5cclxuICAvLyBDYWxsIGxpa2UgdGhpczogZGVsYXkoMTAwMCkudGhlbigoKSA9PiB7IGRvX3NvbWV0aGluZyB9KVxyXG4gIGRlbGF5OiAobXMsIHJldHVyblZhbHVlKSA9PlxyXG4gICAgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XHJcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHJlc29sdmUocmV0dXJuVmFsdWUpXHJcbiAgICAgIH0sIG1zKVxyXG4gICAgfSksXHJcblxyXG4gIC8vIFJldHJ5IGNhbGxpbmcgZm4gdW50aWw6XHJcbiAgLy8gLSBpdCByZXR1cm5zIGEgdHJ1dGh5IHZhbHVlIChvciBhIFByb21pc2UgcmVzb2x2aW5nIHRvIHRydXRoeSlcclxuICAvLyAtIHJldHJpZXMgaXMgcmVhY2hlZCwgaW4gd2hpY2ggY2FzZSB0aGUgZnVuY3Rpb24gcmV0dXJuIGEgcmVqZWN0ZWQgcHJvbWlzZVxyXG4gIHJldHJ5OiAoZm4sIHJldHJpZXMsIHJlcyA9IHVuZGVmaW5lZCkgPT5cclxuICAgIHJldHJpZXMgPT09IDBcclxuICAgICAgPyBQcm9taXNlLnJlamVjdChyZXMpXHJcbiAgICAgIDogUHJvbWlzZS5yZXNvbHZlKGZuKHJlcywgcmV0cmllcykpLnRoZW4oXHJcbiAgICAgICAgICByZXMgPT4gcmVzIHx8IHUuYXN5bmMucmV0cnkoZm4sIHJldHJpZXMgLSAxLCByZXMpXHJcbiAgICAgICAgKSxcclxuXHJcbiAgLy8gQ2FsbCBsaWtlIHRoaXM6IHJldHJ5RGVsYXkoZm4sIDUsIDEwMDApLnRoZW4oKCkgPT4geyBkb19zb21ldGhpbmcgfSksIGZuXHJcbiAgLy8gYmVpbmcgYSBmdW5jdGlvbiB0aGF0IG1pZ2h0IHJldHVybnMgYSBwcm9taXNlXHJcbiAgcmV0cnlEZWxheShmbiwgcmV0cmllcywgbXMsIGVyciA9IHVuZGVmaW5lZCkge1xyXG4gICAgY29uc3QgZm5EZWxheWVkID0gcmV0cmllcyA9PiB1LmFzeW5jLmRlbGF5KG1zKS50aGVuKCgpID0+IGZuKHJldHJpZXMpKVxyXG4gICAgdHJ5IHtcclxuICAgICAgcmV0dXJuIHJldHJpZXMgPT09IDBcclxuICAgICAgICA/IFByb21pc2UucmVqZWN0KGVycilcclxuICAgICAgICA6IFByb21pc2UucmVzb2x2ZShmbihyZXRyaWVzKSkudGhlbihcclxuICAgICAgICAgICAgcmVzID0+IHJlcyB8fCB1LmFzeW5jLnJldHJ5RGVsYXkoZm5EZWxheWVkLCByZXRyaWVzIC0gMSlcclxuICAgICAgICAgIClcclxuICAgIH0gY2F0Y2ggKGUpIHtcclxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGUpXHJcbiAgICB9XHJcbiAgfSxcclxuXHJcbiAgLy8gUmVzb2x2ZSB0byB1bmRlZmluZWQgaWYgbm90IGZvdW5kIChuZXZlciByZWplY3QpXHJcbiAgLy8gQSBiaXQgY29tcGxleCBiZWNhdXNlIHdlIHN1cHBvcnQgIGZpbmRpbmcgaW4gYW4gYXJyYXkgb2YgcHJvbWlzZXNcclxuICBmaW5kOiAoYXJyYXksIGZuLCBlcnIgPSBudWxsKSA9PlxyXG4gICAgIWFycmF5IHx8IGFycmF5Lmxlbmd0aCA9PT0gMFxyXG4gICAgICA/IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpXHJcbiAgICAgIDogUHJvbWlzZS5yZXNvbHZlKGZuKGFycmF5WzBdKSkudGhlbihyZXMgPT5cclxuICAgICAgICAgIHJlcyA/IGFycmF5WzBdIDogdS5hc3luYy5maW5kKGFycmF5LnNsaWNlKDEpLCBmbiwgZXJyKVxyXG4gICAgICAgIClcclxufVxyXG5cclxudS5kb20gPSB7XHJcbiAgLy8gUmVzb2x2ZSB3aGVuIERPTSBpcyByZWFkeVxyXG4gIG9uRE9NUmVhZHkoKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XHJcbiAgICAgIGlmIChkb2N1bWVudC5yZWFkeVN0YXRlICE9PSAnbG9hZGluZycpIHtcclxuICAgICAgICByZXNvbHZlKClcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgcmVzb2x2ZSlcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9LFxyXG5cclxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vaW1hZ2l0YW1hL25vZGVsaXN0LWZvcmVhY2gtcG9seWZpbGwvYmxvYi9tYXN0ZXIvaW5kZXguanNcclxuICBmb3JFYWNoKG5vZGVMaXN0LCBjYWxsYmFjaywgc2NvcGUpIHtcclxuICAgIC8vIER1cGxpY2F0ZSB0aGUgbGlzdCwgc28gdGhhdCB3ZSBjYW4gaXRlcmF0ZSBvdmVyIGEgZHluYW1pYyBub2RlIGxpc3RcclxuICAgIC8vIHJldHVybmVkIGJ5IGdldEVsZW1lbnRzQnlDbGFzc05hbWUoKSBhbmQgdGhlIGxpa2VzLiBJZiB3ZSBkb24ndCwgdGhlXHJcbiAgICAvLyBmb2xsb3dpbmcgd29uJ3Qgd29yaywgYXMgd2UgY2hhbmdlIHRoZSBsaXN0IGR5bmFtaWNhbGx5IHdoaWxlIHdlIGl0ZXJhdGVcclxuICAgIC8vIG92ZXIgaXQ6XHJcbiAgICAvLyB1LmRvbS5mb3JFYWNoKGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ3RvdG8nKSwgbm9kZSA9PiBub2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3RvdG8nKSlcclxuICAgIGNvbnN0IGxpc3QgPSBbLi4ubm9kZUxpc3RdXHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcclxuICAgICAgY2FsbGJhY2suY2FsbChzY29wZSB8fCB3aW5kb3csIGxpc3RbaV0sIGkpXHJcbiAgICB9XHJcbiAgfSxcclxuXHJcbiAgd3JhcChlbCwgd3JhcHBlcikge1xyXG4gICAgZWwucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUod3JhcHBlciwgZWwpXHJcbiAgICB3cmFwcGVyLmFwcGVuZENoaWxkKGVsKVxyXG4gICAgcmV0dXJuIHdyYXBwZXJcclxuICB9LFxyXG5cclxuICB3cmFwQWxsKGVsQXJyYXksIHdyYXBwZXIpIHtcclxuICAgIGlmIChlbEFycmF5ICYmIGVsQXJyYXkubGVuZ3RoKSB7XHJcbiAgICAgIC8vIER1cGxpY2F0ZSB0aGUgYXJyYXkgaW4gY2FzZSBpdCBpcyBhIERPTSBub2RlTGlzdCB0aGFuIHdvdWxkIGJlIG1vZGlmaWVkXHJcbiAgICAgIC8vIHdoaWxlIHdlIG1vdmUgZWxlbWVudHNcclxuICAgICAgY29uc3QgY29weUFycmF5ID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoZWxBcnJheSlcclxuICAgICAgY29weUFycmF5WzBdLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHdyYXBwZXIsIGNvcHlBcnJheVswXSlcclxuICAgICAgY29weUFycmF5LmZvckVhY2goZWwgPT4gd3JhcHBlci5hcHBlbmRDaGlsZChlbCkpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gd3JhcHBlclxyXG4gIH0sXHJcblxyXG4gIGNyZWF0ZUVsZW1lbnQoaHRtbFN0cmluZykge1xyXG4gICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JylcclxuICAgIGRpdi5pbm5lckhUTUwgPSBodG1sU3RyaW5nLnRyaW0oKVxyXG4gICAgcmV0dXJuIGRpdi5maXJzdENoaWxkXHJcbiAgfVxyXG59XHJcblxyXG51LmRvdCA9IHtcclxuICBzZXQob2JqLCBuYW1lLCB2YWx1ZSkge1xyXG4gICAgY29uc3Qgc3BsaXQgPSBuYW1lLnNwbGl0KCcuJylcclxuICAgIHUudGhyb3dJZighc3BsaXQubGVuZ3RoKVxyXG4gICAgY29uc3QgbGFzdE5hbWUgPSBzcGxpdC5wb3AoKVxyXG4gICAgY29uc3QgbyA9IHNwbGl0LnJlZHVjZSgobywgbikgPT4gKG9bbl0gPSB7fSksIG9iailcclxuICAgIG9bbGFzdE5hbWVdID0gdmFsdWVcclxuICB9LFxyXG4gIGdldChvYmosIG5hbWUpIHtcclxuICAgIHJldHVybiBuYW1lXHJcbiAgICAgIC5zcGxpdCgnLicpXHJcbiAgICAgIC5yZWR1Y2UoKG8sIG4pID0+IChvICE9PSB1bmRlZmluZWQgPyBvW25dIDogdW5kZWZpbmVkKSwgb2JqKVxyXG4gIH1cclxufVxyXG4iLCJpbXBvcnQgeyB1IH0gZnJvbSAnLi91dGlscydcclxuXHJcbi8vIEEgZGlzY3BhZ2UgdGFnIGlzIG9mIHRoZSBmb3JtOiBkcGctUEFHRU5BTUUtQ0xJRU5UUk9VVEUtVFJJR0dFUklEXHJcblxyXG4vLyBET04nVCBVU0UgJ1RISVMnIElOIE9CSkVDVCBMSVRFUkFMUzpcclxuLy8gaHR0cDovL2Nsb3N1cmV0b29scy5ibG9nc3BvdC5jb20vMjAxMi8wOS93aGljaC1jb21waWxhdGlvbi1sZXZlbC1pcy1yaWdodC1mb3ItbWUuaHRtbFxyXG5cclxuZXhwb3J0IGNvbnN0IERwZ1RhZyA9IHtcclxuICBfUFJFRklYOiAnZHBnJyxcclxuICBfUEFHRV9JRF9SRUdFWDogL15bMC05XSskLyxcclxuICBfVFJJR0dFUl9JRF9SRUdFWDogL15bMC05QS1aYS16X10rJC8sXHJcblxyXG4gIGJ1aWxkKHsgcGFnZUlkLCB0cmlnZ2VySWQgfSkge1xyXG4gICAgRHBnVGFnLmNoZWNrUGFnZUlkVGhyb3cocGFnZUlkKVxyXG4gICAgdHJpZ2dlcklkICYmIERwZ1RhZy5jaGVja1RyaWdnZXJJZFRocm93KHRyaWdnZXJJZClcclxuICAgIHJldHVybiB0cmlnZ2VySWRcclxuICAgICAgPyBgJHtEcGdUYWcuX1BSRUZJWH0tJHtwYWdlSWR9LSR7dHJpZ2dlcklkfWBcclxuICAgICAgOiBgJHtEcGdUYWcuX1BSRUZJWH0tJHtwYWdlSWR9YFxyXG4gIH0sXHJcblxyXG4gIHBhcnNlKGRjc1RhZykge1xyXG4gICAgY29uc3Qgc3BsaXQgPSBkY3NUYWcuc3BsaXQoJy0nKVxyXG5cclxuICAgIGlmIChzcGxpdC5zaGlmdCgpICE9PSBEcGdUYWcuX1BSRUZJWCkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHBhZ2VJZCA9IHNwbGl0LnNoaWZ0KClcclxuICAgIGlmICghRHBnVGFnLmNoZWNrUGFnZUlkKHBhZ2VJZCkpIHtcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0cmlnZ2VySWQgPSBzcGxpdC5zaGlmdCgpXHJcbiAgICBpZiAodHJpZ2dlcklkICYmICFEcGdUYWcuY2hlY2tUcmlnZ2VySWQodHJpZ2dlcklkKSkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7IHBhZ2VJZCwgdHJpZ2dlcklkIH1cclxuICB9LFxyXG5cclxuICBjaGVja1BhZ2VJZChwYWdlSWQpIHtcclxuICAgIHJldHVybiBEcGdUYWcuX1BBR0VfSURfUkVHRVgudGVzdChwYWdlSWQpXHJcbiAgfSxcclxuXHJcbiAgY2hlY2tQYWdlSWRUaHJvdyhwYWdlSWQpIHtcclxuICAgIGlmICghRHBnVGFnLmNoZWNrUGFnZUlkKHBhZ2VJZCkpIHtcclxuICAgICAgdS50aHJvdyhgSW52YWxpZCBwYWdlSWQgXCIke3BhZ2VJZH1cImApXHJcbiAgICB9XHJcbiAgfSxcclxuXHJcbiAgY2hlY2tUcmlnZ2VySWQodHJpZ2dlcklkKSB7XHJcbiAgICByZXR1cm4gRHBnVGFnLl9UUklHR0VSX0lEX1JFR0VYLnRlc3QodHJpZ2dlcklkKVxyXG4gIH0sXHJcblxyXG4gIGNoZWNrVHJpZ2dlcklkVGhyb3codHJpZ2dlcklkKSB7XHJcbiAgICBpZiAoIURwZ1RhZy5jaGVja1RyaWdnZXJJZCh0cmlnZ2VySWQpKSB7XHJcbiAgICAgIHUudGhyb3coYEludmFsaWQgYmFsbG9vbiBpZCBcIiR7dHJpZ2dlcklkfVwiLiBWYWxpZCBjaGFyYWN0ZXJzIGFyZTogWzAtOUEtWmEtel9dLmApXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IHUgfSBmcm9tICcuL3V0aWxzJ1xyXG5cclxuZXhwb3J0IGNvbnN0IGRpc2NvdXJzZUFQSSA9IHtcclxuICBjb21tZW50VG9waWNUaXRsZShkY3NUYWcpIHtcclxuICAgIHJldHVybiBgRGlzY1BhZ2UgY29tbWVudHMgKCR7ZGNzVGFnfSlgXHJcbiAgfSxcclxuXHJcbiAgX3JlcXVlc3QoeyBtZXRob2QsIHBhdGgsIHBhcmFtcyA9IHVuZGVmaW5lZCB9KSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAkLmFqYXgoe1xyXG4gICAgICAgIFsndHlwZSddOiBtZXRob2QsXHJcbiAgICAgICAgWyd1cmwnXTogcGF0aCxcclxuICAgICAgICBbJ2RhdGEnXTogcGFyYW1zLFxyXG4gICAgICAgIFsnc3VjY2VzcyddOiBkYXRhID0+IHJlc29sdmUoZGF0YSlcclxuICAgICAgfSkuZmFpbChlID0+IHJlamVjdChlLnJlc3BvbnNlVGV4dCkpXHJcbiAgICB9KVxyXG4gIH0sXHJcblxyXG4gIC8vIFRPUElDU1xyXG5cclxuICBnZXRUb3BpY0xpc3QoeyB0YWcgfSkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSVxyXG4gICAgICAuX3JlcXVlc3QoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiBgL3RhZy8ke3RhZ30uanNvbmAgfSlcclxuICAgICAgLnRoZW4odGFnT2JqID0+IHRhZ09ialsndG9waWNfbGlzdCddWyd0b3BpY3MnXSlcclxuICB9LFxyXG5cclxuICAvLyBCZXdhcmU6XHJcbiAgLy8gLSB0aGUgdG9waWMgaWQgaXMgaW4gdG9waWMudG9waWNfaWRcclxuICAvLyAtIHRvcGljLmlkIGlzIHRoZSBpcyBvZiB0aGUgZmlyc3QgdG9waWMgcG9zdFxyXG4gIG5ld1RvcGljKHsgdGl0bGUsIGNvbnRlbnQsIGNhdElkLCB0YWdzIH0pIHtcclxuICAgIHJldHVybiBkaXNjb3Vyc2VBUEkuX3JlcXVlc3Qoe1xyXG4gICAgICBtZXRob2Q6ICdQT1NUJyxcclxuICAgICAgcGF0aDogYC9wb3N0c2AsXHJcbiAgICAgIHBhcmFtczogeyBbJ3RpdGxlJ106IHRpdGxlLCBbJ3JhdyddOiBjb250ZW50LCBbJ2NhdGVnb3J5J106IGNhdElkLCBbJ3RhZ3MnXTogdGFncyB8fCBbXSB9XHJcbiAgICB9KVxyXG4gIH0sXHJcblxyXG4gIC8vIERlbGV0ZSBhIHRvcGljXHJcbiAgLy8gQmV3YXJlIHRoYXQgdG9waWNzIGNyZWF0ZWQgYnkgdGhlIHN5c3RlbSB1c2VyIChzdWNoIGFzIHRoZSBjYXRlZ29yeSBcIkFib3V0XCJcclxuICAvLyB0b3BpY3MpIGNhbm5vdCBiZSBkZWxldGVkIGFuZCB3aWxsIHRocm93IGFuIGV4Y2VwdGlvblxyXG4gIGRlbFRvcGljKHsgdG9waWNJZCB9KSB7XHJcbiAgICByZXR1cm4gZGlzY291cnNlQVBJLl9yZXF1ZXN0KHtcclxuICAgICAgbWV0aG9kOiAnREVMRVRFJyxcclxuICAgICAgcGF0aDogYC90LyR7dG9waWNJZH0uanNvbmBcclxuICAgIH0pXHJcbiAgfSxcclxuXHJcbiAgLy8gQ0FURUdPUklFU1xyXG5cclxuICBnZXRDYXRMaXN0KCkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSVxyXG4gICAgICAuX3JlcXVlc3QoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiBgL2NhdGVnb3JpZXMuanNvbmAgfSlcclxuICAgICAgLnRoZW4ob2JqID0+IG9ialsnY2F0ZWdvcnlfbGlzdCddWydjYXRlZ29yaWVzJ10pXHJcbiAgfSxcclxuXHJcbiAgLy8gVEFHU1xyXG5cclxuICBnZXRUYWdMaXN0KCkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSS5fcmVxdWVzdCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdGFncy5qc29uJyB9KVxyXG4gIH0sXHJcblxyXG4gIC8vIHRhZ3MgaXMgYW4gYXJyYXkgb2Ygc3RyaW5nc1xyXG4gIG5ld1RhZ3ModGFncykge1xyXG4gICAgcmV0dXJuIChcclxuICAgICAgZGlzY291cnNlQVBJXHJcbiAgICAgICAgLm5ld1RvcGljKHtcclxuICAgICAgICAgIHRpdGxlOiAnVGVtcG9yYXJ5IERpc2NQYWdlLWdlbmVyYXRlZCB0b3BpYyAnICsgRGF0ZS5ub3coKSxcclxuICAgICAgICAgIGNvbnRlbnQ6XHJcbiAgICAgICAgICAgICdUaGlzIHRvcGljIHdhcyBzdXBwb3NlZCB0byBiZSByZW1vdmVkIGFuZCBzaG91bGQgbm90IGJlIHRoZXJlLicsXHJcbiAgICAgICAgICB0YWdzXHJcbiAgICAgICAgfSlcclxuICAgICAgICAvLyBTT21ldGltZXMgdGhlIHRvcGljIGlzIG5vdCBkZWxldGVkLiBIb3BlIHRoaXMgd2lsbCBoZWxwLlxyXG4gICAgICAgIC50aGVuKHRlbXBUb3BpYyA9PiB1LmFzeW5jLmRlbGF5KDIwMDAsIHRlbXBUb3BpYykpXHJcbiAgICAgICAgLnRoZW4odGVtcFRvcGljID0+XHJcbiAgICAgICAgICBkaXNjb3Vyc2VBUEkuZGVsVG9waWMoeyB0b3BpY0lkOiB0ZW1wVG9waWNbJ3RvcGljX2lkJ10gfSlcclxuICAgICAgICApXHJcbiAgICApXHJcbiAgfSxcclxuXHJcbiAgLy8gbm90aWZpY2F0aW9uTGV2ZWwgPSAwLi4zXHJcbiAgLy8gUFVUXHJcbiAgLy8gVXJsOiAvdGFnL2Rjcy1taXNzaW8tdGVzdDEvbm90aWZpY2F0aW9uc1xyXG4gIC8vIERhdGE6IHRhZ19ub3RpZmljYXRpb25bbm90aWZpY2F0aW9uX2xldmVsXTogM1xyXG4gIHNldFRhZ05vdGlmaWNhdGlvbih7IHRhZywgbm90aWZpY2F0aW9uTGV2ZWwgfSkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSS5fcmVxdWVzdCh7XHJcbiAgICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICAgIHBhdGg6IGAvdGFnLyR7dGFnfS9ub3RpZmljYXRpb25zYCxcclxuICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgWyd0YWdfbm90aWZpY2F0aW9uJ106IHsgWydub3RpZmljYXRpb25fbGV2ZWwnXTogbm90aWZpY2F0aW9uTGV2ZWwgfVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH0sXHJcblxyXG4gIC8vIFRBRyBHUk9VUFNcclxuXHJcbiAgZ2V0QWxsVGFnR3JvdXBzKCkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSS5fcmVxdWVzdCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdGFnX2dyb3Vwcy5qc29uJyB9KVxyXG4gIH0sXHJcblxyXG4gIC8vIGlmIG9uZVBlclRvcGljID0gdHJ1ZSwgbGltaXQgb25lIHRhZyBwZXIgdG9waWMgZnJvbSB0aGlzIGdyb3VwXHJcbiAgLy8gaWYgc3RhZmZPbmx5ID0gdHJ1ZSwgdGFncyBhcmUgdmlzaWJsZSBvbmx5IHRvIHN0YWZmXHJcbiAgLy8gVEhFIDIgTEFTVCBQQVJBTVMgRE9FU04nVCBXT1JLLCBpdCBzZWVtcyB0aGUgQVBJIGRvZXNuJ3Qgc3VwcG9ydCB0aGVtLlxyXG4gIC8vIFNlZSBodHRwczovL2RvY3MuZGlzY291cnNlLm9yZy8jdGFnL1RhZ3MvcGF0aHMvfjF0YWdfZ3JvdXBzLmpzb24vcG9zdFxyXG4gIG5ld1RhZ0dyb3VwKHsgbmFtZSwgdGFncywgb25lUGVyVG9waWMgPSBmYWxzZSwgc3RhZmZPbmx5ID0gZmFsc2UgfSkge1xyXG4gICAgY29uc3QgcGVybWlzc2lvbnMgPSBzdGFmZk9ubHkgPyB7IFsnc3RhZmYnXTogMSB9IDogdW5kZWZpbmVkXHJcbiAgICByZXR1cm4gZGlzY291cnNlQVBJLl9yZXF1ZXN0KHtcclxuICAgICAgbWV0aG9kOiAnUE9TVCcsXHJcbiAgICAgIHBhdGg6IGAvdGFnX2dyb3Vwc2AsXHJcbiAgICAgIHBhcmFtczoge1xyXG4gICAgICAgIFsnbmFtZSddOiBuYW1lLFxyXG4gICAgICAgIFsndGFnX25hbWVzJ106IHRhZ3MsXHJcbiAgICAgICAgWydvbmVfcGVyX3RvcGljJ106IG9uZVBlclRvcGljLCAvLyBET0VTTidUIFdPUkshISFcclxuICAgICAgICBbJ3Blcm1pc3Npb25zJ106IHBlcm1pc3Npb25zICAgIC8vIERPRVNOJ1QgV09SSyEhIVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG4gIH0sXHJcblxyXG4gIHVwZGF0ZVRhZ0dyb3VwKHsgaWQsIHRhZ3MgfSkge1xyXG4gICAgcmV0dXJuIGRpc2NvdXJzZUFQSS5fcmVxdWVzdCh7XHJcbiAgICAgIG1ldGhvZDogJ1BVVCcsXHJcbiAgICAgIHBhdGg6IGAvdGFnX2dyb3Vwcy8ke2lkfS5qc29uYCxcclxuICAgICAgcGFyYW1zOiB7IFsndGFnX25hbWVzJ106IHRhZ3MgfVxyXG4gICAgfSlcclxuICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgdSB9IGZyb20gJy4vdXRpbHMnXG5pbXBvcnQgeyBEcGdUYWcgfSBmcm9tICcuL0RwZ1RhZydcbmltcG9ydCB7IGRpc2NvdXJzZUFQSSB9IGZyb20gJy4vZGlzY291cnNlQVBJJ1xuLy9pbXBvcnQgQXBwbGljYXRpb25Sb3V0ZSBmcm9tICdkaXNjb3Vyc2Uvcm91dGVzL2FwcGxpY2F0aW9uJ1xuLy9pbXBvcnQgeyBzaW1wbGlmeVRvcGljU3RhdGVzIH0gZnJvbSAnLi9zaW1wbGlmeVRvcGljU3RhdGVzLmpzJ1xuaW1wb3J0IHsgaWNvbkhUTUwgfSBmcm9tICdkaXNjb3Vyc2UtY29tbW9uL2xpYi9pY29uLWxpYnJhcnknXG4vL2ltcG9ydCBQb3N0Q29va2VkIGZyb20gJ2Rpc2NvdXJzZS93aWRnZXRzL3Bvc3QtY29va2VkJ1xuaW1wb3J0IHsgcmVsYXRpdmVBZ2UgfSBmcm9tICdkaXNjb3Vyc2UvbGliL2Zvcm1hdHRlcidcbmltcG9ydCBVc2VyIGZyb20gJ2Rpc2NvdXJzZS9tb2RlbHMvdXNlcidcblxuZXhwb3J0IGNsYXNzIERjc0xheW91dCB7XG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIGNvbnN0cnVjdG9yKGFwcEN0cmwsIHBhZ2VDYXRzKSB7XG4gICAgdGhpcy5hcHBDdHJsID0gYXBwQ3RybFxuICAgIHRoaXMucGFnZUNhdHMgPSBwYWdlQ2F0c1xuICAgIHRoaXMuc2F2ZU1vYmlsZVZpZXcgPSBhcHBDdHJsLnNpdGUubW9iaWxlVmlld1xuICAgIHRoaXMubGVmdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkcGctbGVmdCcpXG4gICAgdGhpcy5naG9zdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkcGctZ2hvc3QnKVxuICAgIHRoaXMubGF5b3V0ID0gbnVsbFxuICAgIHRoaXMucGFnZUlkID0gbnVsbFxuICAgIHRoaXMuY29va2VkID0gbnVsbFxuXG4gICAgLy8gQ2hlY2sgaWYgdXNlciBpcyBhZG1pblxuICAgIGNvbnN0IHVzZXIgPSBVc2VyLmN1cnJlbnQoKVxuICAgIHRoaXMudXNlcklzQWRtaW4gPSB1c2VyICYmIHVzZXJbJ2FkbWluJ11cblxuICAgIC8vIEdldCBhbGwgZHBnIHRhZ3MgYW5kIHN0b3JlIHRoZW0sIHRvZ2V0aGVyIHdpdGggdGhlaXIgcGFyc2VkIHZlcnNpb25cbiAgICB0aGlzLnRhZ3NQcm9taXNlID0gZGlzY291cnNlQVBJLmdldFRhZ0xpc3QoKS50aGVuKHRhZ3MgPT5cbiAgICAgIHRhZ3NbJ3RhZ3MnXS5yZWR1Y2UoKHJlcywgdGFnKSA9PiB7XG4gICAgICAgIHRhZy5wYXJzZWQgPSBEcGdUYWcucGFyc2UodGFnLmlkKVxuICAgICAgICByZXR1cm4gdGFnLnBhcnNlZCA/IFsuLi5yZXMsIHRhZ10gOiByZXNcbiAgICAgIH0sIFtdKVxuICAgIClcblxuICAgIC8vIEdldCBhbGwgZHBnIHRhZyBncm91cHNcbiAgICBpZiAodGhpcy51c2VySXNBZG1pbikge1xuICAgICAgdGhpcy50YWdHcm91cHNQcm9taXNlID0gZGlzY291cnNlQVBJLmdldEFsbFRhZ0dyb3VwcygpLnRoZW4odGFnR3JvdXBzID0+XG4gICAgICAgIHRhZ0dyb3Vwc1sndGFnX2dyb3VwcyddLnJlZHVjZSgocmVzLCB0YWdHcm91cCkgPT4ge1xuICAgICAgICAgIHRhZ0dyb3VwID0ge1xuICAgICAgICAgICAgaWQ6IHRhZ0dyb3VwWydpZCddLFxuICAgICAgICAgICAgbmFtZTogdGFnR3JvdXBbJ25hbWUnXSxcbiAgICAgICAgICAgIHRhZ19uYW1lczogdGFnR3JvdXBbJ3RhZ19uYW1lcyddXG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFdhcm5pbmcgaGVyZTogc29tZSBidWdneSBwbHVnaW5zIGNyZWF0ZSB0YWcgZ3JvdXBzIHdpdGhvdXQgbmFtZXNcbiAgICAgICAgICBpZiAodGFnR3JvdXAubmFtZSAmJiB0YWdHcm91cC5uYW1lLnN0YXJ0c1dpdGgoJ2RwZy0nKSkge1xuICAgICAgICAgICAgY29uc3QgcGFnZUlkID0gdGFnR3JvdXAubmFtZS5zdWJzdHJpbmcoJ2RwZy0nLmxlbmd0aClcbiAgICAgICAgICAgIGlmIChEcGdUYWcuY2hlY2tUcmlnZ2VySWQocGFnZUlkKSkge1xuICAgICAgICAgICAgICAvLyBTb3J0IHRoZSB0YWdzIGZvciBhcnJheSBjb21wYXJpc29uIGxhdGVyXG4gICAgICAgICAgICAgIHRhZ0dyb3VwLnRhZ19uYW1lcy5zb3J0KClcbiAgICAgICAgICAgICAgcmV0dXJuIFsuLi5yZXMsIHRhZ0dyb3VwXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdS5sb2dXYXJuaW5nKGBJbnZhbGlkIGRpc2NwYWdlIHRhZyBncm91cCBcIiR7dGFnR3JvdXAubmFtZX1cImApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiByZXNcbiAgICAgICAgfSwgW10pXG4gICAgICApXG4gICAgfVxuICB9XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgZ2V0U2hvd1JpZ2h0UVAoKSB7XG4gICAgcmV0dXJuIHRoaXMuYXBwQ3RybC5nZXQoJ3Nob3dSaWdodCcpXG4gIH1cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBmaWxsTGVmdCh7IHBhZ2VJZCwgcG9zdElkLCBsYXN0UmV2TnVtLCBjb29rZWQsIHRpdGxlLCBzZWxUcmlnZ2VySWQgfSkge1xuICAgIHUuZGV2LmFzc2VydCh0eXBlb2YgcGFnZUlkID09PSAnc3RyaW5nJylcblxuICAgIC8vIFJlc2V0IHNjcm9sbCBwb3MgaW4gY2FzZSBvZiBuZXcgcGFnZSwgb3IgaWYgaXQncyB0aGUgc2FtZSBwYWdlIGJ1dCB3ZSd2ZVxuICAgIC8vIGdvbmUgdGhyb3VnaCBsYXlvdXQgMSBtZWFudGltZSAoZnVsbCBEaXNjb3Vyc2UpXG4gICAgaWYgKChwYWdlSWQgIT09IHRoaXMucGFnZUlkIHx8IHRoaXMubGF5b3V0ID09PSAxKSAmJiAhc2VsVHJpZ2dlcklkKSB7XG4gICAgICB0aGlzLmxlZnQuc2Nyb2xsVG8oMCwgMClcbiAgICB9XG5cbiAgICBpZiAocG9zdElkICYmIGxhc3RSZXZOdW0gJiYgY29va2VkICYmIHRpdGxlKSB7XG4gICAgICBpZiAocGFnZUlkID09PSB0aGlzLnBhZ2VJZCAmJiBjb29rZWQgPT09IHRoaXMuY29va2VkKSB7XG4gICAgICAgIC8vIENhc2UgdXNlciBoYXMgY2xpY2tlZCBvbiBhIGJhbGxvb24gaW4gdGhlIHNhbWUgcGFnZS4gTmVlZCB0byBjaGVja1xuICAgICAgICAvLyAnY29va2VkJyBpbiBjYXNlIHVzZXIgaGFzIGp1c3QgZWRpdGVkIHRoZSB0b3BpY1xuICAgICAgICB0aGlzLl9oaWdobGlnaHRUcmlnZ2VyKHsgc2VsVHJpZ2dlcklkIH0pXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICB0aGlzLnBhZ2VJZCA9IHBhZ2VJZFxuICAgICAgdGhpcy5jb29rZWQgPSBjb29rZWRcblxuICAgICAgdGhpcy5fZmlsbExlZnRXaXRoSHRtbCh7XG4gICAgICAgIHBhZ2VJZCxcbiAgICAgICAgcG9zdElkLFxuICAgICAgICBsYXN0UmV2TnVtLFxuICAgICAgICBjdXJSZXZOdW06ICdub2RpZmYnLFxuICAgICAgICBjdXJSZXZEYXRlOiB1bmRlZmluZWQsXG4gICAgICAgIGNvb2tlZCxcbiAgICAgICAgdGl0bGUsXG4gICAgICAgIHNlbFRyaWdnZXJJZFxuICAgICAgfSlcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHBhZ2VJZCA9PT0gdGhpcy5wYWdlSWQpIHtcbiAgICAgICAgLy8gQ2FzZSB1c2VyIGhhcyBjbGlja2VkIG9uIGEgYmFsbG9vbiBpbiB0aGUgc2FtZSBwYWdlXG4gICAgICAgIHRoaXMuX2hpZ2hsaWdodFRyaWdnZXIoeyBzZWxUcmlnZ2VySWQgfSlcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGdldChgL3QvJHtwYWdlSWR9Lmpzb25gKVxuICAgICAgICAudGhlbih0b3BpYyA9PiB7XG4gICAgICAgICAgdGhpcy5wYWdlSWQgPSBwYWdlSWRcblxuICAgICAgICAgIC8vIENoZWNrIGlmIHRoZSB0b3BpYyBpcyBzdGlsbCBhIHZhbGlkIHN0YXRpYyBwYWdlIChtaWdodCBoYXZlIGJlZW5cbiAgICAgICAgICAvLyBkZWxldGVkLCBjYXRlZ29yeSBtaWdodCBoYXZlIGJlZW4gY2hhbmdlZC4uLilcbiAgICAgICAgICBpZiAoIXRoaXMucGFnZUNhdHMuZmluZChjID0+IGNbJ2lkJ10gPT09IHRvcGljWydjYXRlZ29yeV9pZCddKSkge1xuICAgICAgICAgICAgdGhpcy5jb29rZWQgPSAnZXJyb3InXG4gICAgICAgICAgICB1LmxvZyhcbiAgICAgICAgICAgICAgYFdvbid0IGRpc3BsYXkgc3RhdGljIHBhZ2UgJHtwYWdlSWR9LCBiZWNhdXNlIGNhdGVnb3J5ICR7dG9waWNbXG4gICAgICAgICAgICAgICAgJ2NhdGVnb3J5X2lkJ1xuICAgICAgICAgICAgICBdfSBpcyBub3QgYSBzdGF0aWMgcGFnZWBcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHRoaXMuX2ZpbGxMZWZ0V2l0aE9vcHMoKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCBwb3N0ID0gdG9waWNbJ3Bvc3Rfc3RyZWFtJ11bJ3Bvc3RzJ11bMF1cbiAgICAgICAgICAgIHRoaXMuY29va2VkID0gcG9zdFsnY29va2VkJ11cbiAgICAgICAgICAgIHRoaXMuX2ZpbGxMZWZ0V2l0aEh0bWwoe1xuICAgICAgICAgICAgICBwYWdlSWQsXG4gICAgICAgICAgICAgIHBvc3RJZDogcG9zdFsnaWQnXSxcbiAgICAgICAgICAgICAgbGFzdFJldk51bTogcG9zdFsndmVyc2lvbiddLFxuICAgICAgICAgICAgICBjdXJSZXZOdW06ICdub2RpZmYnLFxuICAgICAgICAgICAgICBjdXJSZXZEYXRlOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgIGNvb2tlZDogdGhpcy5jb29rZWQsXG4gICAgICAgICAgICAgIHRpdGxlOiB0b3BpY1snZmFuY3lfdGl0bGUnXSxcbiAgICAgICAgICAgICAgc2VsVHJpZ2dlcklkXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICAgIHRoaXMuY29va2VkID0gJ2Vycm9yJ1xuICAgICAgICAgIHUubG9nKFxuICAgICAgICAgICAgYFdvbid0IGRpc3BsYXkgc3RhdGljIHBhZ2UgJHtwYWdlSWR9LCBiZWNhdXNlIGl0IGRvZXNuJ3QgZXhpc3Qgb3IgaXMgcHJpdmF0ZWBcbiAgICAgICAgICApXG4gICAgICAgICAgdGhpcy5fZmlsbExlZnRXaXRoT29wcygpXG4gICAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgX2ZpbGxMZWZ0V2l0aE9vcHMoKSB7XG4gICAgdGhpcy5fZmlsbExlZnRXaXRoSHRtbCh7XG4gICAgICBwYWdlSWQ6ICdlcnJvcicsXG4gICAgICBwb3N0SWQ6IHVuZGVmaW5lZCxcbiAgICAgIGxhc3RSZXZOdW06IHVuZGVmaW5lZCxcbiAgICAgIGN1clJldk51bTogJ25vZGlmZicsXG4gICAgICBjdXJSZXZEYXRlOiB1bmRlZmluZWQsXG4gICAgICBjb29rZWQ6ICc8cD5QbGVhc2UgY29udGFjdCB5b3VyIGFkbWluaXN0cmF0b3IuPC9wPicsXG4gICAgICB0aXRsZTogXCJPb3BzISBUaGF0IHBhZ2UgZG9lc24ndCBleGlzdCBhbnltb3JlXCIsXG4gICAgICBzZWxUcmlnZ2VySWQ6IG51bGxcbiAgICB9KVxuICB9XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgX2ZpbGxMZWZ0V2l0aEh0bWwoe1xuICAgIHBhZ2VJZCxcbiAgICBwb3N0SWQsXG4gICAgbGFzdFJldk51bSxcbiAgICBjdXJSZXZOdW0sXG4gICAgY3VyUmV2RGF0ZSxcbiAgICBjb29rZWQsXG4gICAgdGl0bGUsXG4gICAgc2VsVHJpZ2dlcklkXG4gIH0pIHtcbiAgICB1LmRldi5hc3NlcnQodHlwZW9mIHBhZ2VJZCA9PSAnc3RyaW5nJywgYGludmFsaWQgcGFnZUlkIFwiJHtwYWdlSWR9XCJgKVxuXG4gICAgLy8gUmVtb3ZlIHRoZSBcInJldmlzaW9uIGJ1dHRvblwiIHRhZ1xuICAgIGNvb2tlZCA9IGNvb2tlZFxuICAgICAgLnJlcGxhY2UoJ3tkcGctc2hvdy1yZXYtYnV0dG9ufScsICcnKVxuICAgICAgLnJlcGxhY2UoJ3tkcGctdGl0bGUtYmFsbG9vbn0nLCAnJylcblxuICAgIC8vIENyZWF0ZSB0aGUgcGFnZSBjb250ZW50IHNrZWxldG9uXG4gICAgLy8gVGhlIGRncC1oZWFkZXIgYW5kIGRwaC1mb290ZXIgc2VjdGlvbnMgbWltaWMgdGhlIGFjdHVhbCBkcGctYm9keSwgc29cbiAgICAvLyB0aGF0IHdlYm1hc3RlcnMgY2FuIGFsaWduIGJhY2tncm91bmQgaW1hZ2VzIGluIHRoZSBoZWFkZXIvZm9vdGVyIHdpdGhcbiAgICAvLyB0ZXh0cyBmcm9tIHRoZSBwb3N0LlxuICAgIGNvbnN0IGNvbnRlbnQgPSAkKGBcbiAgICAgIDxkaXYgY2xhc3M9XCJkcGctcGFnZS1jb250ZW50XCI+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJkcGctYnV0dG9ucyAke2N1clJldk51bSAhPT0gJ25vZGlmZicgPyAnc2VsZWN0ZWQnIDogJyd9XCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRwZy1idXR0b25zLWxlZnRcIj48L2Rpdj48ZGl2IGNsYXNzPVwiZHBnLWJ1dHRvbnMtY2VudGVyXCI+PC9kaXY+PGRpdiBjbGFzcz1cImRwZy1idXR0b25zLXJpZ2h0XCI+PC9kaXY+ICAgICAgICBcbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJkcGctaGVhZGVyXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRwZy1oZWFkZXItMVwiPjxkaXYgY2xhc3M9XCJkcGctaGVhZGVyLTJcIj48ZGl2IGNsYXNzPVwiZHBnLWhlYWRlci0zXCI+PC9kaXY+PC9kaXY+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICA8ZGl2IGNsYXNzPVwiZHBnLWJvZHlcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwid3JhcFwiPlxuICAgICAgICAgICAgPCEtLSA8ZGl2IGNsYXNzPVwicG9zdHMtd3JhcHBlclwiPiBGSVggRk9SIElTU1VFIGh0dHBzOi8vZ2l0aHViLmNvbS9zeWxxdWUvZGlzY3BhZ2UvaXNzdWVzLzYgLS0+IFxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwidG9waWMtYm9keVwiPlxuICAgICAgICAgICAgICAgIDwhLS0gQ29va2VkIHBvc3QgdG8gYmUgaW5zZXJ0ZWQgaGVyZSAtLT5cbiAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICA8IS0tIDwvZGl2PiAtLT5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3M9XCJkcGctZm9vdGVyXCI+XG4gICAgICAgICAgPGRpdiBjbGFzcz1cImRwZy1mb290ZXItMVwiPjxkaXYgY2xhc3M9XCJkcGctZm9vdGVyLTJcIj48ZGl2IGNsYXNzPVwiZHBnLWZvb3Rlci0zXCI+PC9kaXY+PC9kaXY+PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgPC9kaXY+XG4gICAgYClcblxuICAgIC8vIEFkZCB0aGUgcG9zdCBodG1sIChjb29rZWQgdmVyc2lvbilcbiAgICAvLyBIZXJlIHdlIG5lZWQgdGhlIFwiY29va2VkICsgZGVjb3JhdGVkXCIgdmVyc2lvbiBvZiB0aGUgcG9zdC4gRGVjb3JhdG9yc1xuICAgIC8vIGFyZSB2ZXJ5IGltcG9ydGFudCwgYmVjYXVzZSB0aGV5IGxvYWQgcGljdHVyZXMgKGxhenkgbG9hZGluZykgYW5kIGNhbGxcbiAgICAvLyB0aGUgYmJjb2RlIHJlbmRlcmluZy4gTGF6eSBsb2FkaW5nIGRlY29yYXRvcjpcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZGlzY291cnNlL2Rpc2NvdXJzZS9ibG9iLzJkMzExM2U0ZGE3NGJlMmEwMjg4ZGJlMzI3MzA5M2NkMmQyN2ZkMjEvYXBwL2Fzc2V0cy9qYXZhc2NyaXB0cy9kaXNjb3Vyc2UvbGliL2xhenktbG9hZC1pbWFnZXMuanMuZXM2I0wxMDdcbiAgICBjb25zdCB0aXRsZUJhbGxvb24gPSB0aGlzLmNvb2tlZC5pbmNsdWRlcygne2RwZy10aXRsZS1iYWxsb29ufScpXG4gICAgICA/ICc8c3BhbiBjbGFzcz1cImRwZy1iYWxsb29uLXRleHRcIiBkYXRhLWRwZy1pZD1cInRpdGxlXCI+PC9zcGFuPidcbiAgICAgIDogJydcbiAgICBjb25zdCBjb29rZWRXaXRoVGl0bGUgPSBgPGgxPiR7dGl0bGUgKyB0aXRsZUJhbGxvb259PC9oMT5cXG5gICsgY29va2VkXG4gICAgY29uc3QgcG9zdENvb2tlZE9iamVjdCA9IHRoaXMuZGVjb3JhdG9ySGVscGVyWydjb29rZWQnXShjb29rZWRXaXRoVGl0bGUpXG4gICAgY29uc3QgY29va2VkQW5kRGVjb3JhdGVkID0gcG9zdENvb2tlZE9iamVjdFsnaW5pdCddKClcbiAgICBjb250ZW50LmZpbmQoJy5kcGctYm9keSAudG9waWMtYm9keScpLmFwcGVuZChjb29rZWRBbmREZWNvcmF0ZWQpXG5cbiAgICBjb25zdCBmb3JjZUxvd2VyY2FzZSA9IHRoaXMuYXBwQ3RybC5zaXRlU2V0dGluZ3NbJ2ZvcmNlX2xvd2VyY2FzZV90YWdzJ11cbiAgICBjb25zdCBtYXhUYWdMZW5ndGggPSB0aGlzLmFwcEN0cmwuc2l0ZVNldHRpbmdzWydtYXhfdGFnX2xlbmd0aCddXG5cbiAgICAvLyBIaWRlIGFsbCBiYWRnZXMgZm9yIG5vd1xuICAgIGNvbnRlbnQuZmluZCgnLmRwZy1iYWRnZScpLmhpZGUoKVxuXG4gICAgLy8gR28gdGhyb3VnaCBiYWxsb29uc1xuICAgIGNvbnN0IGRwZ1RhZ3MgPSB7fVxuICAgIGNvbnRlbnQuZmluZCgnLmRwZy1iYWxsb29uLXRleHQnKS5lYWNoKChpLCB0ZXh0RWwpID0+IHtcbiAgICAgIGxldCBkcGdUYWdcbiAgICAgIGNvbnN0IGJhbGxvb25JZCA9IHRleHRFbC5kYXRhc2V0WydkcGdJZCddXG5cbiAgICAgIGxldCAkYmFsbG9vblRleHQgPSAkKHRleHRFbClcblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gR2V0IHRoZSBiYWxsb29uIGlkXG4gICAgICAgIHUudGhyb3dJZihcbiAgICAgICAgICAhYmFsbG9vbklkLFxuICAgICAgICAgICdNaXNzaW5nIGJhbGxvb24gaWQuIFRoZSBjb3JyZWN0IHN5bnRheCBpcyBbZHBnYiBpZD1zb21ldGhpbmddWy9kcGdiXS4nXG4gICAgICAgIClcblxuICAgICAgICAvLyBCdWlsZCB0aGUgZHBnVGFnXG4gICAgICAgIGRwZ1RhZyA9IERwZ1RhZy5idWlsZCh7IHBhZ2VJZCwgdHJpZ2dlcklkOiBiYWxsb29uSWQgfSlcblxuICAgICAgICAvLyBDaGVjayB0YWcgbGVuZ3RoLCBjYXNlIGFuZCBkdXBsaWNhdGVzXG4gICAgICAgIHUudGhyb3dJZihcbiAgICAgICAgICBkcGdUYWcubGVuZ3RoID4gbWF4VGFnTGVuZ3RoLFxuICAgICAgICAgIGBCYWxsb29uIGlkIGlzIHRvbyBsb25nLiBSZXN1bHRpbmcgdGFnIGlzIFxcXCIke2RwZ1RhZ31cXFwiLCB3aGljaCBoYXMgYSBsZW5ndGggb2YgJHtkcGdUYWcubGVuZ3RofS4gVGhpcyBkb2Vzbid0IGZpdCBtYXhfdGFnX2xlbmd0aD0ke21heFRhZ0xlbmd0aH0gaW4gRGlzY291cnNlIHNldHRpbmdzLiBGaXg6IGVpdGhlciBzaG9ydGVuIHRoZSBiYWxsb29uIGlkLCBvciBpbmNyZWFzZSBtYXhfdGFnX2xlbmd0aC5gXG4gICAgICAgIClcbiAgICAgICAgdS50aHJvd0lmKFxuICAgICAgICAgIGZvcmNlTG93ZXJjYXNlICYmIGRwZ1RhZyAhPT0gZHBnVGFnLnRvTG93ZXJDYXNlKCksXG4gICAgICAgICAgYEJhbGxvb24gaWQgaGFzIHVwcGVyY2FzZS4gVGhpcyBkb2Vzbid0IGZpdCBmb3JjZV9sb3dlcmNhc2VfdGFncz10cnVlIGluIERpc2NvdXJzZSBzZXR0aW5ncy4gRml4OiBlaXRoZXIgbWFrZSB5b3VyIGJhbGxvb24gaWQgYWxsIGxvd2VyY2FzZSwgb3Igc2V0IGZvcmNlX2xvd2VyY2FzZV90YWdzIHRvIGZhbHNlLmBcbiAgICAgICAgKVxuXG4gICAgICAgIC8vIFVTRVIgTUlHSFQgTkVFRCBEVVBMSUNBVEVTISBGb3IgZXhhbXBsZSB3aXRoIG11bHRpbGluZ3VhbCBwb3N0cy5cbiAgICAgICAgaWYgKGRwZ1RhZ3NbZHBnVGFnXSkge1xuICAgICAgICAgIHUubG9nV2FybmluZyhcbiAgICAgICAgICAgIGBEdXBsaWNhdGUgYmFsbG9vbiBpZCBcIiR7ZHBnVGFnfVwiLiBUaGlzIGlzIHVzdWFsbHkgYSBiYWQgaWRlYS5gXG4gICAgICAgICAgKVxuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChlIGluc3RhbmNlb2YgdS5EaXNjcGFnZUVycm9yKSB7XG4gICAgICAgICAgdS5sb2dFcnJvcihlLm1lc3NhZ2UpXG4gICAgICAgICAgJGJhbGxvb25UZXh0LmFwcGVuZChcbiAgICAgICAgICAgIGA8c3BhbiBjbGFzcz1cImRwZy1lcnJvclwiIHRpdGxlPVwiJHtlLm1lc3NhZ2V9XCI+RGlzY1BhZ2UgRXJyb3I8L3NwYW4+YFxuICAgICAgICAgIClcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlXG4gICAgICB9XG5cbiAgICAgIC8vIFllcyEgV2UgZm91bmQgYSBiYWxsb29uOlxuICAgICAgZHBnVGFnc1tkcGdUYWddID0gdHJ1ZVxuXG4gICAgICAvLyBCdWlsZCB0aGUgcmlnaHQgZHBnLWJhbGxvb24tcGFyZW50IGFuZCBkcGctYmFsbG9vbi10ZXh0IG5vZGVzXG4gICAgICBsZXQgJGJhbGxvb25QYXJlbnRcbiAgICAgIGlmICh0ZXh0RWwuY2hpbGROb2Rlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gQ2FzZSBlbXB0eSB0ZXh0XG4gICAgICAgIGNvbnN0IGlzUm9vdCA9ICRiYWxsb29uVGV4dC5wYXJlbnQoKS5pcygnLmNvb2tlZCwuZHBnLXN1YnNlYycpXG4gICAgICAgIGNvbnN0ICRwcmVjZWRpbmdCbG9jayA9ICRiYWxsb29uVGV4dC5wcmV2KClcbiAgICAgICAgaWYgKGlzUm9vdCAmJiAkcHJlY2VkaW5nQmxvY2subGVuZ3RoKSB7XG4gICAgICAgICAgLy8gQ2FzZSBlbXB0eSB0ZXh0ICphZnRlciogYSBibG9jayAoZm9yIGV4YW1wbGUgYSBiYWxsb29uIGFmdGVyIGFcbiAgICAgICAgICAvLyBwaWN0dXJlKTogdGFrZSB0aGUgZW1wdHkgdGV4dCBibG9jayBhbmQgcHV0IGl0IGFyb3VuZCB0aGVcbiAgICAgICAgICAvLyBjb250ZW50IG9mIHRoZSBwcmVjZWRpbmcgYmxvY2suXG4gICAgICAgICAgJGJhbGxvb25QYXJlbnQgPSAkcHJlY2VkaW5nQmxvY2tcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBDYXNlIGVtcHR5IHRleHQgKmluKiBhIGJsb2NrIChmb3IgZXhhbXBsZSBhIGJhbGxvb24gYXQgdGhlIGVuZFxuICAgICAgICAgIC8vIG9mIGEgaGVhZGluZyk6IHRha2UgdGhlIGVtcHR5IHRleHQgYmxvY2sgYW5kIHB1dCBpdCBhcm91bmQgdGhlXG4gICAgICAgICAgLy8gY29udGVudCBvZiB0aGUgcGFyZW50IGJsb2NrLlxuICAgICAgICAgICRiYWxsb29uUGFyZW50ID0gJGJhbGxvb25UZXh0LnBhcmVudCgpXG4gICAgICAgIH1cbiAgICAgICAgJGJhbGxvb25UZXh0LmRldGFjaCgpXG4gICAgICAgICRiYWxsb29uUGFyZW50LmFkZENsYXNzKCdkcGctYmFsbG9vbi1wYXJlbnQnKS53cmFwSW5uZXIoJGJhbGxvb25UZXh0KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQ2FzZSBub24tZW1wdHkgdGV4dDoganVzdCBjcmVhdGUgdGhlIHBhcmVudCBhcm91bmQgdGhlIGJhbGxvb24gdGV4dFxuICAgICAgICAkYmFsbG9vblRleHQud3JhcCgnPHNwYW4gY2xhc3M9XCJkcGctYmFsbG9vbi1wYXJlbnRcIiAvPicpXG4gICAgICAgICRiYWxsb29uUGFyZW50ID0gJGJhbGxvb25UZXh0LnBhcmVudCgpXG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCB0aGUgaWNvbnMgKGJhbGxvb24gYW5kIGJhZGdlKVxuICAgICAgJGJhbGxvb25QYXJlbnQuYXBwZW5kKGBcbiAgICAgICAgPHNwYW4gY2xhc3M9XCJkcGctaWNvbnNcIiB0aXRsZT1cIkNsaWNrIHRvIGRpc2N1c3MgdGhpcyBwYXJ0XCI+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJkcGctYmFsbG9vblwiPiR7aWNvbkhUTUwoJ2NvbW1lbnQnKX08L3NwYW4+XG4gICAgICAgICAgPHNwYW4gY2xhc3M9XCJkcGctYmFkZ2VcIiBzdHlsZT1cImRpc3BsYXk6bm9uZVwiPjk5PC9zcGFuPlxuICAgICAgICA8L3NwYW4+XG4gICAgICBgKVxuXG4gICAgICAvLyBJbnNlcnQgdGhlIHN1YnNlYyBpZiBuZWVkZWRcbiAgICAgIGlmICgkYmFsbG9vblBhcmVudC5pcygnaDEsaDIsaDMsaDQsaDUsaDYnKSkge1xuICAgICAgICAkYmFsbG9vblBhcmVudFxuICAgICAgICAgIC5uZXh0VW50aWwoJ2gxLGgyLGgzLGg0LGg1LGg2JylcbiAgICAgICAgICAuYWRkQmFjaygpXG4gICAgICAgICAgLndyYXBBbGwoJzxkaXYgY2xhc3M9XCJkcGctc3Vic2VjXCI+PC9kaXY+JylcbiAgICAgIH1cblxuICAgICAgLy8gU2V0IHRoZSBiYWxsb29uIGNsaWNrIGhhbmRsZXJcbiAgICAgICRiYWxsb29uUGFyZW50LmZpbmQoJy5kcGctaWNvbnMnKS5jbGljayhlID0+IHtcbiAgICAgICAgdGhpcy5hcHBDdHJsLmdldCgncm91dGVyJykudHJhbnNpdGlvblRvKGAvdGFnLyR7ZHBnVGFnfWApXG5cbiAgICAgICAgLy8gVGhpcyBpcyB1c2VsZXNzLCBzaW5jZSB0aGUgbmV3IHJvdXRlIHdpbGwgc2VsZWN0IHRoZSBjb3JyZWN0IHRyaWdnZXJcbiAgICAgICAgLy8gYW55d2F5IGEgc2Vjb25kIGxhdGVyLiBCdXQgd2UgZG8gaXQgbm9uZXRoZWxlc3MsIHNvIHRoYXQgdGhlIFVJIGlzXG4gICAgICAgIC8vIG1vcmUgcmVzcG9uc2l2ZS5cbiAgICAgICAgdGhpcy5faGlnaGxpZ2h0VHJpZ2dlcih7IHNlbFRyaWdnZXJJZDogYmFsbG9vbklkIH0pXG5cbiAgICAgICAgLy8gUHJldmVudCBidWJibGluZyB0byB0b3AtbGV2ZWwsIGJlY2F1c2UgYSBjbGljayBvbiB0b3AtbGV2ZWxcbiAgICAgICAgLy8gaXMgdXNlZCBmb3IgZGVzZWxlY3Rpb25cbiAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgLy8gQWRtaW4gb25seTogY3JlYXRlIHRoZSBEaXNjb3Vyc2UgdGFncyBjb3JyZXNwb25kaW5nIHRvIGFsbCBiYWxsb29ucyBmb3VuZFxuICAgIC8vIFRIRVJFIElTIEFOIElTU1VFIEhFUkU6IGFyZW4ndCBub3JtYWwgdXNlcnMgc3VwcG9zZWQgdG8gYmUgYWxsb3dlZCB0b1xuICAgIC8vIGNyZWF0ZSBzdGF0aWMgcGFnZXMgd2l0aCBiYWxsb29ucz8gTm8sIHdlIG5lZWQgdG8gZm9yYmlkIHRoYXQuXG4gICAgY29uc3QgdGFncyA9IE9iamVjdC5rZXlzKGRwZ1RhZ3MpXG4gICAgaWYgKHRoaXMudXNlcklzQWRtaW4gJiYgdGFncy5sZW5ndGgpIHtcbiAgICAgIHRoaXMudGFnR3JvdXBzUHJvbWlzZS50aGVuKHRhZ0dyb3VwcyA9PiB7XG4gICAgICAgIGNvbnN0IHRhZ0dyb3VwTmFtZSA9IGBkcGctJHtwYWdlSWR9YFxuICAgICAgICBjb25zdCBleGlzdGluZ1RhYkdyb3VwID0gdGFnR3JvdXBzLmZpbmQoXG4gICAgICAgICAgdGFnR3JvdXAgPT4gdGFnR3JvdXAubmFtZSA9PT0gdGFnR3JvdXBOYW1lXG4gICAgICAgIClcbiAgICAgICAgdGFncy5zb3J0KClcbiAgICAgICAgaWYgKGV4aXN0aW5nVGFiR3JvdXApIHtcbiAgICAgICAgICBpZiAoIWVxdWFscyhleGlzdGluZ1RhYkdyb3VwLnRhZ19uYW1lcywgdGFncykpIHtcbiAgICAgICAgICAgIGRpc2NvdXJzZUFQSS51cGRhdGVUYWdHcm91cCh7IGlkOiBleGlzdGluZ1RhYkdyb3VwLmlkLCB0YWdzIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRpc2NvdXJzZUFQSS5uZXdUYWdHcm91cCh7IG5hbWU6IHRhZ0dyb3VwTmFtZSwgdGFncyB9KVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBiYWRnZXNcbiAgICB0aGlzLnRhZ3NQcm9taXNlLnRoZW4odGFncyA9PiB7XG4gICAgICAvLyBXaGF0J3MgdGhlIHByb2JsZW0gaGVyZT8gdGFnLmNvdW50IGluY2x1ZGVzIGRlbGV0ZWQgYW5kIHVubGlzdGVkIHRvcGljc1xuICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9zeWxxdWUvZGlzY3BhZ2UvaXNzdWVzLzVcblxuICAgICAgLy8gQ3JlYXRlIHRoZSBiYWRnZSBsaXN0IGZvciB0aGlzIHBhZ2VcbiAgICAgIGNvbnN0IGJhZGdlcyA9IHRhZ3MucmVkdWNlKChyZXMsIHRhZykgPT4ge1xuICAgICAgICBpZiAodGFnLmNvdW50ICYmIHRhZy5wYXJzZWQucGFnZUlkID09PSBwYWdlSWQpIHtcbiAgICAgICAgICBjb25zdCAkdGV4dCA9IGNvbnRlbnQuZmluZChcbiAgICAgICAgICAgIGAuZHBnLWJhbGxvb24tdGV4dFtkYXRhLWRwZy1pZD1cIiR7dGFnLnBhcnNlZC50cmlnZ2VySWR9XCJdYFxuICAgICAgICAgIClcbiAgICAgICAgICBpZiAoJHRleHQubGVuZ3RoKSB7XG4gICAgICAgICAgICB0YWcuJGJhZGdlTm9kZSA9ICR0ZXh0Lm5leHQoKS5maW5kKCcuZHBnLWJhZGdlJylcbiAgICAgICAgICAgIHJlcy5wdXNoKHRhZylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdS5sb2dXYXJuaW5nKFxuICAgICAgICAgICAgICBgSW4gcGFnZSBcIiR7cGFnZUlkfVwiOiBtaXNzaW5nIGJhbGxvb24gZm9yIHRhZyBcIiR7dGFnLmlkfVwiYFxuICAgICAgICAgICAgKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzXG4gICAgICB9LCBbXSlcblxuICAgICAgLy8gRGlzcGxheSB0aGUgYmFkZ2VzXG4gICAgICB1LmFzeW5jLmZvckVhY2goYmFkZ2VzLCBiYWRnZSA9PlxuICAgICAgICBkaXNjb3Vyc2VBUElcbiAgICAgICAgICAuZ2V0VG9waWNMaXN0KHsgdGFnOiBiYWRnZS5pZCB9KVxuICAgICAgICAgIC50aGVuKHRvcGljcyA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb3VudCA9IHRvcGljcy5maWx0ZXIodG9waWMgPT4gdG9waWMudmlzaWJsZSkubGVuZ3RoXG4gICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgYmFkZ2UuJGJhZGdlTm9kZS50ZXh0KGNvdW50KS5zaG93KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICAgIC8vIFdlIHdhaXQgYSBiaXQsIHNvIGFzIHRvIG5vdCBiZSBjYXVnaHQgYnkgRGlzY291cnNlIHNlY3VyaXR5XG4gICAgICAgICAgLy8gKHB1cmUgcHJlY2F1dGlvbiwgYXMgSSBkaWRuJ3QgdGVzdCB3aXRob3V0IHRoaXMgdGhyb3R0bGluZylcbiAgICAgICAgICAudGhlbigoKSA9PiB1LmFzeW5jLmRlbGF5KDI1MCkpXG4gICAgICApXG4gICAgfSlcblxuICAgIGNvbnN0IHJpZ2h0QnV0dG9ucyA9IGNvbnRlbnQuZmluZCgnLmRwZy1idXR0b25zLXJpZ2h0JylcbiAgICBjb25zdCBjZW50ZXJCdXR0b25zID0gY29udGVudC5maW5kKCcuZHBnLWJ1dHRvbnMtY2VudGVyJylcblxuICAgIC8vIEluc2VydCByZXZpc2lvbiBuYXZpZ2F0aW9uIGlmIGxhc3QgcG9zdCByZXZpc2lvbiBlbmRzIHdpdGgge2RwZy1yZXYtbmF2fVxuICAgIGNvbnN0IHNob3dSZXZCdXR0b24gPSB0aGlzLmNvb2tlZC5pbmNsdWRlcygne2RwZy1zaG93LXJldi1idXR0b259JylcbiAgICBpZiAoIXRoaXMuc2F2ZU1vYmlsZVZpZXcgJiYgbGFzdFJldk51bSA+IDEgJiYgc2hvd1JldkJ1dHRvbikge1xuICAgICAgLy8gRGVmaW5lIGEgZnVuY3Rpb24gdG8gdXBkYXRlIHRoZSBjb250ZW50XG4gICAgICBjb25zdCBmaWxsTGVmdCA9ICh7IGN1clJldk51bSwgcmV2ID0gbnVsbCB9KSA9PiB7XG4gICAgICAgIHRoaXMuX2ZpbGxMZWZ0V2l0aEh0bWwoe1xuICAgICAgICAgIHBhZ2VJZCxcbiAgICAgICAgICBwb3N0SWQsXG4gICAgICAgICAgbGFzdFJldk51bSxcbiAgICAgICAgICBjdXJSZXZOdW0sXG4gICAgICAgICAgY3VyUmV2RGF0ZTogcmV2ID8gcmV2WydjcmVhdGVkX2F0J10gOiB1bmRlZmluZWQsXG4gICAgICAgICAgY29va2VkOiByZXYgPyByZXZbJ2JvZHlfY2hhbmdlcyddWydpbmxpbmUnXSA6IHRoaXMuY29va2VkLFxuICAgICAgICAgIHRpdGxlLFxuICAgICAgICAgIHNlbFRyaWdnZXJJZFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBzaG93UmV2TmF2ID0gY3VyUmV2TnVtICE9PSAnbm9kaWZmJ1xuXG4gICAgICAvLyBJbnNlcnQgdGhlIFwiU2hvdyByZXZpc2lvbnNcIiBidXR0b25cbiAgICAgICRmYUljb24oe1xuICAgICAgICBpY29uTmFtZTogJ2hpc3RvcnknLFxuICAgICAgICB0aXRsZTogJ1Nob3cgcGFnZSByZXZpc2lvbnMnLFxuICAgICAgICBpZDogJ2RwZy1zaG93LXJldi1uYXYnXG4gICAgICB9KVxuICAgICAgICAuY2xpY2soKCkgPT4ge1xuICAgICAgICAgIGlmICghc2hvd1Jldk5hdikge1xuICAgICAgICAgICAgZ2V0KGAvcG9zdHMvJHtwb3N0SWR9L3JldmlzaW9ucy8ke2xhc3RSZXZOdW19Lmpzb25gKS50aGVuKHJldiA9PiB7XG4gICAgICAgICAgICAgIGZpbGxMZWZ0KHsgY3VyUmV2TnVtOiBsYXN0UmV2TnVtLCByZXYgfSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZpbGxMZWZ0KHsgY3VyUmV2TnVtOiAnbm9kaWZmJyB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmFwcGVuZFRvKHJpZ2h0QnV0dG9ucylcblxuICAgICAgaWYgKHNob3dSZXZOYXYpIHtcbiAgICAgICAgJGZhSWNvbih7XG4gICAgICAgICAgaWNvbk5hbWU6ICdiYWNrd2FyZCcsXG4gICAgICAgICAgdGl0bGU6ICdQcmV2aW91cyByZXZpc2lvbnMnLFxuICAgICAgICAgIGlkOiAnZHBnLXByZXYtcmV2JyxcbiAgICAgICAgICBkaXNhYmxlZDogY3VyUmV2TnVtID09PSAyXG4gICAgICAgIH0pXG4gICAgICAgICAgLmFwcGVuZFRvKGNlbnRlckJ1dHRvbnMpXG4gICAgICAgICAgLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG5ld1Jldk51bSA9IGN1clJldk51bSAtIDFcbiAgICAgICAgICAgIGdldChgL3Bvc3RzLyR7cG9zdElkfS9yZXZpc2lvbnMvJHtuZXdSZXZOdW19Lmpzb25gKS50aGVuKHJldiA9PiB7XG4gICAgICAgICAgICAgIGZpbGxMZWZ0KHsgY3VyUmV2TnVtOiBuZXdSZXZOdW0sIHJldiB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuXG4gICAgICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShjdXJSZXZEYXRlKVxuICAgICAgICBjb25zdCBhZ2UgPSByZWxhdGl2ZUFnZShkYXRlLCB7IGZvcm1hdDogJ21lZGl1bS13aXRoLWFnbycgfSlcbiAgICAgICAgY2VudGVyQnV0dG9ucy5hcHBlbmQoXG4gICAgICAgICAgYDxzcGFuIGNsYXNzPVwiZHBnLWRhdGVcIiB0aXRsZT0ke2RhdGV9PiR7YWdlfTwvc3Bhbj5gXG4gICAgICAgIClcblxuICAgICAgICAkZmFJY29uKHtcbiAgICAgICAgICBpY29uTmFtZTogJ2ZvcndhcmQnLFxuICAgICAgICAgIHRpdGxlOiAnTmV4dCByZXZpc2lvbicsXG4gICAgICAgICAgaWQ6ICdkcGctbmV4dC1yZXYnLFxuICAgICAgICAgIGRpc2FibGVkOiBjdXJSZXZOdW0gPT09IGxhc3RSZXZOdW1cbiAgICAgICAgfSlcbiAgICAgICAgICAuYXBwZW5kVG8oY2VudGVyQnV0dG9ucylcbiAgICAgICAgICAuY2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgbmV3UmV2TnVtID0gY3VyUmV2TnVtICsgMVxuICAgICAgICAgICAgZ2V0KGAvcG9zdHMvJHtwb3N0SWR9L3JldmlzaW9ucy8ke25ld1Jldk51bX0uanNvbmApLnRoZW4ocmV2ID0+IHtcbiAgICAgICAgICAgICAgZmlsbExlZnQoeyBjdXJSZXZOdW06IG5ld1Jldk51bSwgcmV2IH0pXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSW5zZXJ0IGFkbWluIGJ1dHRvbnNcbiAgICBpZiAodGhpcy51c2VySXNBZG1pbikge1xuICAgICAgLy8gV3JlbmNoIGJ1dHRvblxuICAgICAgJGZhSWNvbih7XG4gICAgICAgIGljb25OYW1lOiAnd3JlbmNoJyxcbiAgICAgICAgdGl0bGU6ICdFZGl0IHRpdGxlJyxcbiAgICAgICAgaWQ6ICdkcGctZWRpdC10aXRsZS1idXR0b24nXG4gICAgICB9KVxuICAgICAgICAuY2xpY2soKCkgPT4ge1xuICAgICAgICAgICQoJ2h0bWwnKS50b2dnbGVDbGFzcygnZHBnJywgZmFsc2UpXG4gICAgICAgICAgJCgnYS5lZGl0LXRvcGljJykuY2xpY2soKVxuICAgICAgICAgICQoJyNtYWluLW91dGxldCcpLmNsaWNrKGUgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2xpY2tlZEJ0biA9IGUudGFyZ2V0LmNsb3Nlc3QoXG4gICAgICAgICAgICAgICcuZWRpdC1jb250cm9scyAuYnRuLCAudG9waWMtYWRtaW4tcG9wdXAtbWVudSAudG9waWMtYWRtaW4tcmVzZXQtYnVtcC1kYXRlLCAudG9waWMtYWRtaW4tcG9wdXAtbWVudSAudG9waWMtYWRtaW4tdmlzaWJsZSdcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIGlmIChjbGlja2VkQnRuKSB7XG4gICAgICAgICAgICAgIHRoaXMuX2ZpbGxMZWZ0V2l0aEh0bWwoe1xuICAgICAgICAgICAgICAgIHBhZ2VJZCxcbiAgICAgICAgICAgICAgICBwb3N0SWQsXG4gICAgICAgICAgICAgICAgbGFzdFJldk51bSxcbiAgICAgICAgICAgICAgICBjdXJSZXZOdW0sXG4gICAgICAgICAgICAgICAgY3VyUmV2RGF0ZSxcbiAgICAgICAgICAgICAgICBjb29rZWQsXG4gICAgICAgICAgICAgICAgdGl0bGU6ICQoJ2lucHV0I2VkaXQtdGl0bGUnKS52YWwoKSxcbiAgICAgICAgICAgICAgICBzZWxUcmlnZ2VySWRcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgJCgnaHRtbCcpLnRvZ2dsZUNsYXNzKCdkcGcnLCB0cnVlKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICAgIC53cmFwKCc8ZGl2PjxkaXY+JylcbiAgICAgICAgLnBhcmVudCgpXG4gICAgICAgIC5hcHBlbmRUbyhyaWdodEJ1dHRvbnMpXG5cbiAgICAgIC8vIEVkaXQgYnV0dG9uXG4gICAgICAkZmFJY29uKHtcbiAgICAgICAgaWNvbk5hbWU6ICdwZW5jaWwtYWx0JyxcbiAgICAgICAgdGl0bGU6ICdFZGl0IHBhZ2UnLFxuICAgICAgICBpZDogJ2RwZy1lZGl0LXBhZ2UtYnV0dG9uJ1xuICAgICAgfSlcbiAgICAgICAgLmNsaWNrKCgpID0+IHtcbiAgICAgICAgICAvLyBGaW5kIERpc2NvdXJzZSBlZGl0IGJ1dHRvbi4gSXQgbWlnaHQgYmUgaGlkZGVuIHVuZGVyIHRoZSBcIi4uLlwiIGJ1dHRvbi5cbiAgICAgICAgICBjb25zdCBkaXNjRWRpdEJ0biA9ICQoJ2FydGljbGUjcG9zdF8xIGJ1dHRvbi5lZGl0JylcbiAgICAgICAgICBpZiAoZGlzY0VkaXRCdG4ubGVuZ3RoKSB7XG4gICAgICAgICAgICBkaXNjRWRpdEJ0bi5jbGljaygpXG4gICAgICAgICAgICBzZXRGdWxsU2NyZWVuQ29tcG9zZXIodGhpcy5zYXZlTW9iaWxlVmlldylcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgZGlzY1Nob3dNb3JlQnRuID0gJCgnYXJ0aWNsZSNwb3N0XzEgYnV0dG9uLnNob3ctbW9yZS1hY3Rpb25zJylcbiAgICAgICAgICAgIGRpc2NTaG93TW9yZUJ0bi5jbGljaygpXG4gICAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZGlzY0VkaXRCdG4gPSAkKCdhcnRpY2xlI3Bvc3RfMSBidXR0b24uZWRpdCcpXG4gICAgICAgICAgICAgIGRpc2NFZGl0QnRuLmNsaWNrKClcbiAgICAgICAgICAgICAgc2V0RnVsbFNjcmVlbkNvbXBvc2VyKHRoaXMuc2F2ZU1vYmlsZVZpZXcpXG4gICAgICAgICAgICB9LCAwKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLndyYXAoJzxkaXY+PGRpdj4nKVxuICAgICAgICAucGFyZW50KClcbiAgICAgICAgLmFwcGVuZFRvKHJpZ2h0QnV0dG9ucylcbiAgICB9XG5cbiAgICAvLyBJbnNlcnQgdGhlIHBhZ2UgY29udGVudFxuICAgICQodGhpcy5sZWZ0KS5lbXB0eSgpLmFwcGVuZChjb250ZW50KVxuXG4gICAgLy8gSGlnaGxpZ2h0IHRoZSBzZWxlY3RlZCBiYWxsb29uXG4gICAgdGhpcy5faGlnaGxpZ2h0VHJpZ2dlcih7IHNlbFRyaWdnZXJJZCB9KVxuXG4gICAgLy8gU2VuZCBhIGN1c3RvbSBldmVudCB0byA8aHRtbD4sIGZvciBjdXN0b21pemF0aW9uIHB1cnBvc2VcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuZGlzcGF0Y2hFdmVudChcbiAgICAgIG5ldyBDdXN0b21FdmVudCgnZHBnX2Rpc3BsYXlwYWdlJywge1xuICAgICAgICBkZXRhaWw6IHtcbiAgICAgICAgICBbJ3BhZ2VJZCddOiBwYXJzZUludChwYWdlSWQpLFxuICAgICAgICAgIFsndGl0bGUnXTogdGl0bGUsXG4gICAgICAgICAgWydjb29rZWQnXTogY29va2VkLFxuICAgICAgICAgIFsnbm9kZSddOiBjb250ZW50WzBdLFxuICAgICAgICAgIFsnc2VsVHJpZ2dlcklkJ106IHNlbFRyaWdnZXJJZCxcbiAgICAgICAgICBbJ2N1clJldk51bSddOiBjdXJSZXZOdW0sXG4gICAgICAgICAgWydjdXJSZXZEYXRlJ106IGN1clJldkRhdGVcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApXG5cbiAgICAvKlxuICAgIGNvbnN0IHNlbGVjdGVkSGVhZGVyID0gY29udGVudC5maW5kKCcuZHBnLWJhbGxvb24tdGV4dC5kcGctaGlnaGxpZ2h0ZWQnKVxuICAgIGlmIChzZWxlY3RlZEhlYWRlci5sZW5ndGgpIHtcbiAgICAgIHNlbGVjdGVkSGVhZGVyWzBdLnNjcm9sbEludG9WaWV3KClcbiAgICB9XG4gICAgKi9cbiAgfVxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIF9oaWdobGlnaHRUcmlnZ2VyKHsgc2VsVHJpZ2dlcklkIH0pIHtcbiAgICBjb25zdCAkbGVmdCA9ICQodGhpcy5sZWZ0KVxuXG4gICAgLy8gVW5zZWxlY3QgZXZlcnl0aGluZ1xuICAgICRsZWZ0LmZpbmQoJy5kcGctYmFsbG9vbi10ZXh0LCAuZHBnLXN1YnNlYycpLnJlbW92ZUNsYXNzKCdkcGctaGlnaGxpZ2h0ZWQnKVxuXG4gICAgLy8gSWYgbm8gdHJpZ2dlciBpcyBzZWxlY3RlZCwgcXVpdFxuICAgIGlmICghc2VsVHJpZ2dlcklkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBGaW5kIHRoZSBzZWxlY3RlZCBoZWFkZXJcbiAgICBjb25zdCAkc2VsVGV4dCA9ICRsZWZ0LmZpbmQoXG4gICAgICBgLmRwZy1iYWxsb29uLXRleHRbZGF0YS1kcGctaWQ9JHtzZWxUcmlnZ2VySWR9XWBcbiAgICApXG4gICAgaWYgKCEkc2VsVGV4dC5sZW5ndGgpIHtcbiAgICAgIHUubG9nV2FybmluZyhcbiAgICAgICAgYHNlbGVjdGVkIGJhbGxvb24gXCIke3NlbFRyaWdnZXJJZH1cIiBoYXMgbm90IGJlZW4gZm91bmQgaW4gcGFnZSBcIiR7dGhpc1xuICAgICAgICAgIC5wYWdlSWR9XCJgXG4gICAgICApXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBIaWdobGlnaHQgdGhlIGhlYWRlciBhbmQgcGFyZW50IHN1YnNlY3Rpb25cbiAgICAkc2VsVGV4dC5hZGRDbGFzcygnZHBnLWhpZ2hsaWdodGVkJylcbiAgICBpZiAoJHNlbFRleHQucGFyZW50KCkuaXMoJ2gxLGgyLGgzLGg0LGg1LGg2JykpIHtcbiAgICAgIC8vIEltcG9ydGFudCB0ZXN0XG4gICAgICAkc2VsVGV4dC5jbG9zZXN0KCcuZHBnLXN1YnNlYycpLmFkZENsYXNzKCdkcGctaGlnaGxpZ2h0ZWQnKVxuICAgIH1cblxuICAgIC8vIFNjcm9sbCBpbnRvIHZpZXcgaWYgbmVlZGVkLiBUaGUgdmlzaWJpbGl0eSB0ZXN0IGlzIHJlcXVpcmVkLCBiZWNhdXNlXG4gICAgLy8gd2UgZG9uJ3Qgd2FudCB0byBzY3JvbGwgd2hlbiB0aGUgdXNlciBoYXMgY2xpY2tlZCBvbiBhIGJhbGxvb24uXG4gICAgLy8gUmVtZW1iZXIgdGhhdCB3ZSBuZWVkIHRvIGhpZ2hsaWdodCBhIGhlYWRlciB3aGVuOiB1c2VyIGNsaWNrcyBhIGJhbGxvb24sXG4gICAgLy8gYXQgbG9hZCB0aW1lIG9uIGEgdGFnIHBhZ2UsIGFuZCB3aGVuIG9wZW5pbmcgYSBtaW5pbWl6ZWQgY29tcG9zZXIuXG4gICAgLy8gV0FSTklORzogRE9OJ1QgU0NST0xMIFRIRSBCQUxMT09OIElOVE8gVklFVy4gT25seSB0aGUgVGV4dCBpcyBhbHJlYWR5XG4gICAgLy8gdGhlcmUgYXQgbG9hZCB0aW1lLlxuICAgIGNvbnN0IHJlY3RUZXh0ID0gJHNlbFRleHRbMF0uZ2V0Qm91bmRpbmdDbGllbnRSZWN0KClcbiAgICBjb25zdCByZWN0TGVmdCA9IHRoaXMubGVmdC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgIC8vIGh0dHBzOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8yMjQ4MDkzOC8zNTY3MzUxXG4gICAgY29uc3QgaXNQYXJ0aWFsbHlWaXNpYmxlID1cbiAgICAgIHJlY3RUZXh0LnRvcCA8IHJlY3RMZWZ0LmJvdHRvbSAmJiByZWN0VGV4dC5ib3R0b20gPj0gcmVjdExlZnQudG9wXG4gICAgaWYgKCFpc1BhcnRpYWxseVZpc2libGUpIHtcbiAgICAgICRzZWxUZXh0WzBdLnNjcm9sbEludG9WaWV3KClcbiAgICB9XG4gIH1cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBfYW5pbWF0ZUdob3N0KGxlZnRTdGFydCwgbGVmdEVuZCwgb25GaW5pc2gpIHtcbiAgICBpZiAodGhpcy5naG9zdC5hbmltYXRlKSB7XG4gICAgICAvLyBDYXNlIHRoZSBicm93c2VyIHN1cHBvcnRzIHRoZSBXZWIgQW5pbWF0aW9uIEFQSVxuICAgICAgY29uc3QgYW5pbSA9IHRoaXMuZ2hvc3QuYW5pbWF0ZShcbiAgICAgICAgW3sgbGVmdDogbGVmdFN0YXJ0IH0sIHsgbGVmdDogbGVmdEVuZCB9XSxcbiAgICAgICAgeyBkdXJhdGlvbjogMjAwIH1cbiAgICAgIClcbiAgICAgIGlmIChvbkZpbmlzaCkge1xuICAgICAgICBhbmltLm9uZmluaXNoID0gb25GaW5pc2hcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgb25GaW5pc2ggJiYgb25GaW5pc2goKVxuICAgIH1cbiAgfVxuXG4gIF9hbmltYXRlR2hvc3RSTChvbkZpbmlzaCkge1xuICAgIGNvbnN0IGVuZCA9IGlzV2lkZVNjcmVlbigpID8gJzUwJScgOiAnMCUnXG4gICAgdGhpcy5fYW5pbWF0ZUdob3N0KCcxMDAlJywgZW5kLCBvbkZpbmlzaClcbiAgfVxuXG4gIF9hbmltYXRlR2hvc3RMUigpIHtcbiAgICBjb25zdCBzdGFydCA9IGlzV2lkZVNjcmVlbigpID8gJzUwJScgOiAnMCUnXG4gICAgdGhpcy5fYW5pbWF0ZUdob3N0KHN0YXJ0LCAnMTAwJScpXG4gIH1cblxuICBzZXRMYXlvdXQobmV3TGF5b3V0KSB7XG4gICAgaWYgKG5ld0xheW91dCA9PT0gdGhpcy5sYXlvdXQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vYWZ0ZXJSZW5kZXIoKS50aGVuKCgpID0+IHtcbiAgICBzd2l0Y2ggKHRoaXMubGF5b3V0KSB7XG4gICAgICBjYXNlIG51bGw6XG4gICAgICBjYXNlIDE6XG4gICAgICAgIC8vIE5PTkUgPT4gQU5ZXG4gICAgICAgIC8vIFJJR0hUX09OTFkgPT4gQU5ZXG4gICAgICAgICQoJ2h0bWwnKS5hdHRyKCdkYXRhLWRwZy1sYXlvdXQnLCBuZXdMYXlvdXQpXG4gICAgICAgIGJyZWFrXG5cbiAgICAgIGNhc2UgMDpcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaWYgKG5ld0xheW91dCA9PT0gMykge1xuICAgICAgICAgIC8vIExFRlRfT05MWSA9PiBTUExJVFxuICAgICAgICAgIC8vIExFRlRfV0lUSF9CQVIgPT4gU1BMSVRcbiAgICAgICAgICB0aGlzLl9hbmltYXRlR2hvc3RSTCgoKSA9PiB7XG4gICAgICAgICAgICAkKCdodG1sJykuYXR0cignZGF0YS1kcGctbGF5b3V0JywgbmV3TGF5b3V0KVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgJCgnaHRtbCcpLmF0dHIoJ2RhdGEtZHBnLWxheW91dCcsIG5ld0xheW91dClcbiAgICAgICAgfVxuICAgICAgICBicmVha1xuXG4gICAgICBjYXNlIDM6XG4gICAgICAgICQoJ2h0bWwnKS5hdHRyKCdkYXRhLWRwZy1sYXlvdXQnLCBuZXdMYXlvdXQpXG4gICAgICAgIGlmIChuZXdMYXlvdXQgPT09IDAgfHwgbmV3TGF5b3V0ID09PSAyKSB7XG4gICAgICAgICAgLy8gU1BMSVQgPT4gTEVGVF9PTkxZXG4gICAgICAgICAgLy8gU1BMSVQgPT4gTEVGVF9XSVRIX0JBUlxuICAgICAgICAgIHRoaXMuX2FuaW1hdGVHaG9zdExSKClcbiAgICAgICAgfVxuICAgICAgICBicmVha1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICB1LnRocm93KClcbiAgICB9XG5cbiAgICAvLyBBdCBsb2FkIHRpbWUsIGlmIHdlIGFyZSBvbiBtb2JpbGUgbGF5b3V0IDMgKHJpZ2h0IHBhbmUgb25seSksIHRoZVxuICAgIC8vIHNjcm9sbEludG9WaWV3IHdlJ3ZlIGp1c3QgZG9uZSBvbiB0aGUgbGVmdCBwYW5lIChpbiBfaGlnaGxpZ2h0VHJpZ2dlcilcbiAgICAvLyBmYWlsZWQgYmVjYXVzZSB0aGUgbGVmdCBwYW5lIGlzbid0IHZpc2libGUuIFNvIG5vdyB0aGF0IHdlIGdvIHRvIFxuICAgIC8vIGxheW91dCAyIChsZWZ0IHBhbmUgb25seSksIHdlIG5lZWQgdG8gc2Nyb2xsIHRvIHRoZSBzZWxlY3RlZCBiYWxsb29uLlxuICAgIGlmIChuZXdMYXlvdXQgPT0gMikge1xuICAgICAgY29uc3Qgc2VsVHJpZ2dlciA9ICQodGhpcy5sZWZ0KS5maW5kKCcuZHBnLWJhbGxvb24tdGV4dC5kcGctaGlnaGxpZ2h0ZWQnKVxuICAgICAgaWYgKHNlbFRyaWdnZXIubGVuZ3RoKSB7XG4gICAgICAgIHNlbFRyaWdnZXJbMF0uc2Nyb2xsSW50b1ZpZXcoKVxuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMubGF5b3V0ID0gbmV3TGF5b3V0XG4gIH1cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbn1cblxuZnVuY3Rpb24gaXNXaWRlU2NyZWVuKCkge1xuICByZXR1cm4gd2luZG93LmlubmVyV2lkdGggPj0gMTAzNVxufVxuXG5mdW5jdGlvbiBzZXRXaWRlQ2xhc3MoKSB7XG4gICQoJ2h0bWwnKS50b2dnbGVDbGFzcygnZHBnLXdpZGUnLCBpc1dpZGVTY3JlZW4oKSlcbn1cblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3Jlc2l6ZScsIHNldFdpZGVDbGFzcylcblxuc2V0V2lkZUNsYXNzKClcblxuY29uc3QgZ2V0ID0gdXJsID0+XG4gIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAkLmdldCh1cmwsIGRhdGEgPT4gcmVzb2x2ZShkYXRhKSkuZmFpbCgoKSA9PiByZWplY3QoYGdldCBcIiR7dXJsfVwiIGZhaWxlZGApKVxuICB9KVxuXG4vLyBSZXR1cm4gdHJ1ZSBpZiBhcnJheTEgYW5kIGFycmF5MiBjb250YWluIHRoZSBzYW1lIGVsZW1lbnRzIGluIHRoZSBzYW1lIG9yZGVyXG5mdW5jdGlvbiBlcXVhbHMoYXJyYXkxLCBhcnJheTIpIHtcbiAgcmV0dXJuIChcbiAgICBhcnJheTEubGVuZ3RoID09PSBhcnJheTIubGVuZ3RoICYmXG4gICAgYXJyYXkxLmV2ZXJ5KCh2YWx1ZSwgaW5kZXgpID0+IHZhbHVlID09PSBhcnJheTJbaW5kZXhdKVxuICApXG59XG5cbmZ1bmN0aW9uICRmYUljb24oeyBpY29uTmFtZSwgdGl0bGUsIGlkID0gJycsIGNsYXNzZXMgPSAnJywgZGlzYWJsZWQgPSBmYWxzZSB9KSB7XG4gIGNvbnN0IHRpdGxlU3RyID0gdGl0bGUgPyBgdGl0bGU9XCIke3RpdGxlfVwiYCA6ICcnXG4gIGNvbnN0IGlkU3RyID0gaWQgPyBgaWQ9XCIke2lkfVwiYCA6ICcnXG4gIGNvbnN0IGNsYXNzZXNTdHIgPSBjbGFzc2VzIHx8ICcnXG4gIGNvbnN0IGRpc2FibGVkU3RyID0gZGlzYWJsZWQgPyAnZGlzYWJsZWQ9XCJcIicgOiAnJ1xuICByZXR1cm4gJChgICAgIFxuICAgIDxidXR0b24gJHt0aXRsZVN0cn0gJHtpZFN0cn0gJHtkaXNhYmxlZFN0cn0gY2xhc3M9XCJidG4tZGVmYXVsdCBidG4gbm8tdGV4dCBidG4taWNvbiAke2NsYXNzZXNTdHJ9XCIgdHlwZT1cImJ1dHRvblwiPiAgICBcbiAgICAgIDxzdmcgY2xhc3M9XCJmYSBkLWljb24gZC1pY29uLSR7aWNvbk5hbWV9IHN2Zy1pY29uIHN2Zy1zdHJpbmdcIiB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCI+XG4gICAgICAgIDx1c2UgeGxpbms6aHJlZj1cIiMke2ljb25OYW1lfVwiPjwvdXNlPlxuICAgICAgPC9zdmc+XG4gICAgPC9idXR0b24+XG4gIGApXG59XG5cbi8qXG5mdW5jdGlvbiBwYXJzZU5leHREcGdUYWcoeyB0ZXh0LCB0YWdOYW1lLCBrZXlzID0gbnVsbCwgcmVwbGFjZSA9IG51bGwgfSkge1xuICAvLyBGaW5kIHRoZSB0YWdcbiAgY29uc3QgaSA9IHRleHQuc2VhcmNoKG5ldyBSZWdFeHAoYHske3RhZ05hbWV9KFxcXFxzK3x9KWAsICdnJykpXG4gIGlmIChpID09PSAtMSkge1xuICAgIHJldHVyblxuICB9XG4gIGNvbnN0IGogPSB0ZXh0LmluZGV4T2YoJ30nLCBpKVxuICB1LnRocm93SWYoaSA9PT0gLTEsICdUYWlsaW5nIH0gbm90IGZvdW5kJylcblxuICAvLyBleHRyYWN0IHRoZSBwcm9wZXJ0aWVzXG4gIGNvbnN0IHByb3BzU3RyID0gdGV4dC5zdWJzdHJpbmcoaSArIHRhZ05hbWUubGVuZ3RoICsgMSwgailcblxuICAvLyBSZXBsYWNlIHRoZSB0YWcgaWYgbmVlZGVkXG4gIGlmICh0eXBlb2YgcmVwbGFjZSA9PT0gJ3N0cmluZycpIHtcbiAgICB0ZXh0ID0gdS5zcGxpY2VTdHIodGV4dCwgaSwgaiAtIGkgKyAxLCByZXBsYWNlKVxuICB9XG5cbiAgLy8gR28gdGhyb3VnaCB0aGUgcHJvcGVydGllc1xuICBjb25zdCBwYWlycyA9IHByb3BzU3RyLnNwbGl0KC9cXHMrLykuZmlsdGVyKHAgPT4gISFwKVxuICBjb25zdCBwcm9wcyA9IHBhaXJzLnJlZHVjZSgocmVzLCB2YWwpID0+IHtcbiAgICBjb25zdCBwYWlyID0gdmFsLnNwbGl0KCc9JylcbiAgICB1LnRocm93SWYoXG4gICAgICBwYWlyLmxlbmd0aCAhPT0gMixcbiAgICAgIGBJbnZhbGlkIERpc2NQYWdlIHRhZzogaW5jb3JyZWN0IHByb3BlcnR5IGxpc3QgXCIke3BhaXJ9XCJgXG4gICAgKVxuICAgIGNvbnN0IGtleSA9IHBhaXJbMF1cbiAgICB1LnRocm93SWYoXG4gICAgICAha2V5cyB8fCAha2V5cy5pbmNsdWRlcyhrZXkpLFxuICAgICAgYEludmFsaWQgRGlzY1BhZ2UgdGFnOiB1bmtub3duIGtleSBcIiR7a2V5fVwiYFxuICAgIClcbiAgICByZXNba2V5XSA9IHBhaXJbMV1cbiAgICByZXR1cm4gcmVzXG4gIH0sIHt9KVxuXG4gIGNvbnN0IG1pc3NpbmdOdW0gPSAoa2V5cy5sZW5ndGggfHwgMCkgLSBPYmplY3Qua2V5cyhwcm9wcykubGVuZ3RoXG4gIHUudGhyb3dJZihtaXNzaW5nTnVtLCBgSW52YWxpZCBEaXNjUGFnZSB0YWc6ICR7bWlzc2luZ051bX0gbWlzc2luZyBrZXkocylgKVxuXG4gIHJldHVybiB7IHRleHQsIHByb3BzLCBwb3M6IGkgfVxufVxuKi9cblxuZnVuY3Rpb24gc2V0RnVsbFNjcmVlbkNvbXBvc2VyKG1vYmlsZVZpZXcpIHtcbiAgaWYgKCFtb2JpbGVWaWV3KSB7XG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAkKCdidXR0b24udG9nZ2xlLWZ1bGxzY3JlZW4nKS5jbGljaygpXG4gICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgJCgnLnNhdmUtb3ItY2FuY2VsJykuYXBwZW5kKFxuICAgICAgICAgICc8c3BhbiBzdHlsZT1cImNvbG9yOiM2NDY0NjRcIj5jdHJsK2VudGVyID0gc3VibWl0IHwgZXNjID0gZXhpdDwvc3Bhbj4nXG4gICAgICAgIClcbiAgICAgIH0sIDUwMClcbiAgICB9LCA1MDApXG4gIH1cbn1cblxuLypcbi8vIFJlcGxhY2UgdGhlIHBhcmVudFxuICAgICAgLy8gSW5zZXJ0IHRoZSBpY29uczogYmFsbG9vbiBhbmQgYmFkZ2VcbiAgICAgIC8vIFNWRyBpY29uczogc2VlIGh0dHBzOi8vbWV0YS5kaXNjb3Vyc2Uub3JnL3QvaW50cm9kdWNpbmctZm9udC1hd2Vzb21lLTUtYW5kLXN2Zy1pY29ucy8xMDE2NDNcbiAgICAgIHBhcmVudC53cmFwSW5uZXIoJCgnPHNwYW4gY2xhc3M9XCJkcGctYmFsbG9vbi10ZXh0XCIgLz4nKSlcbiAgICAgIGJhbGxvb24ucmVtb3ZlKCkgLy8gUmVtb3ZlIHRoZSBvbGQgbWFya2Rvd24gYmFsbG9vblxuICAgICAgcGFyZW50LmFwcGVuZChgXG4gICAgICAgIDxzcGFuIGNsYXNzPVwiZHBnLWljb25zXCIgdGl0bGU9XCJDbGljayB0byBkaXNjdXNzIHRoaXMgcGFydFwiPlxuICAgICAgICAgIDxzcGFuIGNsYXNzPVwiZHBnLWJhbGxvb25cIj4ke2ljb25IVE1MKCdjb21tZW50Jyl9PC9zcGFuPlxuICAgICAgICAgIDxkaXYgY2xhc3M9XCJkcGctYmFkZ2VcIiBzdHlsZT1cImRpc3BsYXk6bm9uZVwiPjwvZGl2PlxuICAgICAgICA8L3NwYW4+XG4gICAgICBgKVxuKi9cbiIsImltcG9ydCBVc2VyIGZyb20gJ2Rpc2NvdXJzZS9tb2RlbHMvdXNlcidcbmltcG9ydCB7IHUgfSBmcm9tICcuL3V0aWxzJ1xuaW1wb3J0IHsgRGNzTGF5b3V0IH0gZnJvbSAnLi9EY3NMYXlvdXQnXG5cbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiBvbkFmdGVyUmVuZGVyKGNvbnRhaW5lciwgcGFnZUNhdHMsIHRyaWdnZXJDYXRzKSB7XG4gIGNvbnN0IGFwcEN0cmwgPSBjb250YWluZXIubG9va3VwKCdjb250cm9sbGVyOmFwcGxpY2F0aW9uJylcblxuICAvLyBBZGQgY2xhc3NlcyB0byB0aGUgPGh0bWw+IHRhZ1xuICBsZXQgY2xhc3NlcyA9ICdkcGcnXG4gIC8vY2xhc3NlcyArPSB1c2VySXNBZG1pbiA/ICcgZHBnLWFkbWluJyA6ICcgZHBnLW5vdC1hZG1pbidcblxuICAvLyBBZGQgYSBuZXcgc3R5bGUgc2hlZXQgZm9yIHN0eWxlIGluamVjdGlvblxuICAvLyBXQVJOSU5HOiBkb24ndCBpbmplY3QgbmV3IHN0eWxlIGluIGFuIGV4aXN0aW5nIHNoZWV0LCBvciB5b3UnbGwgZ2V0IGFuXG4gIC8vIOKAnFRoZSBvcGVyYXRpb24gaXMgaW5zZWN1cmXigJ0gZXhjZXB0aW9uIGluIEZpcmVmb3hcbiAgY29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpXG4gIGRvY3VtZW50LmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpXG5cbiAgLy8gSGlkZSB0aGUgJ2Fib3V0JyB0b3BpYyBvZiB0aGUgUGFnZSBjYXRlZ29yeS4gVGhpcyB0b3BpYyBpcyBwYWluZnVsIGJlY2F1c2VcbiAgLy8gaXQgaXMgYXV0b21hdGljYWxseSBjcmVhdGVkIGJ5IERpc2NvdXJzZSwgY2Fubm90IGJlIGRlbGV0ZWQsIGFuZCBoYXMgdGhlIFBhZ2VcbiAgLy8gY2F0ZWdvcnkgKHNvIGl0IHdpbGwgYmUgZGlzcGxheWVkIGFzIGEgc3RhdGljIHBhZ2UpXG4gIHBhZ2VDYXRzLmZvckVhY2gocGFnZUNhdCA9PiB7XG4gICAgY29uc3QgYWJvdXRUb3BpY0lkID0gcGFnZUNhdFsndG9waWNfdXJsJ10uc3BsaXQoJy8nKS5wb3AoKVxuICAgIHN0eWxlLnNoZWV0Lmluc2VydFJ1bGUoXG4gICAgICBgaHRtbC5kcGcgLmNhdGVnb3J5LXBhZ2UgLnRvcGljLWxpc3QtaXRlbS5jYXRlZ29yeS1wYWdlW2RhdGEtdG9waWMtaWQ9XCIke2Fib3V0VG9waWNJZH1cIl0geyBkaXNwbGF5OiBub25lOyB9YFxuICAgIClcbiAgfSlcblxuICAvLyBEaXNjUGFnZSBkb2VzIGl0cyBiZXN0IHRvIHByZXZlbnQgdXNlcnMgZnJvbSB1c2luZyB0aGUgYmFsbG9vbiBjYXRlZ29yeSBcbiAgLy8gbWFudWFsbHkuVGhlIHJlYXNvbiBpcyB0aGF0IHRoZSBiYWxsb29uIGNhdGVnb3J5IGlzIHN1cHBvc2VkIHRvIGJlIGFwcGxpZWQgXG4gIC8vIGF1dG9tYXRpY2FsbHkgYnkgRGlzY1BhZ2UsIHdoZW4gdGhlIHVzZXIgY3JlYXRlcyBhIG5ldyB0b3BpYyBpbiBhIGJhbGxvb24uXG4gIC8vIFNvIHlvdSBtaWdodCB0aGluayB0aGUgc29sdXRpb24gaXMgdG8gdXNlIERpc2NvdXJzZSBzZWN1cml0eSBmZWF0dXJlcyB0b1xuICAvLyByZXN0cmljdCBhY2Nlc3MgdG8gdGhlIGJhbGxvb24gY2F0ZWdvcnkuIFdST05HLiBJZiB5b3UgZG8gdGhpcywgdXNlcnNcbiAgLy8gd29uJ3QgYmUgYWJsZSB0byBjcmVhdGUgdG9waWNzIGluIHRoaXMgY2F0ZWdvcnkhIFNvIHdlIG5lZWQgdG8gZG8gdGhpcyBcbiAgLy8gYnkgaGFuZDpcbiAgLy8gMS4gV2UnbGwgaGlkZSB0aGUgYmFsbG9vbiBjYXRlZ29yeSBmcm9tIHRoZSBjYXRlZ29yeSBjb21ibyBib3ggaW4gdGhlIFxuICAvLyDigJxOZXcgVG9waWPigJ0gZGlhbG9nLlxuICAvLyAyLiBXZSdsbCBkaXNhYmxlIHRoZSDigJxOZXcgVG9waWPigJ0gYnV0dG9uIG9uIHRoZSBiYWxsb29uIGNhdGVnb3J5IHBhZ2UuICBcbiAgaWYgKHRyaWdnZXJDYXRzKSB7XG4gICAgY2xhc3NlcyArPSAnIGRwZy1oaWRlLWJhbGxvb24tY2F0J1xuXG4gICAgdHJpZ2dlckNhdHMuZm9yRWFjaCh0cmlnZ2VyQ2F0ID0+IHtcbiAgICAgIGNvbnN0IG5hbWUgPSB0cmlnZ2VyQ2F0WyduYW1lJ11cbiAgICAgIGNvbnN0IHNsdWcgPSB0cmlnZ2VyQ2F0WydzbHVnJ11cblxuICAgICAgLy8gSGlkZSB0aGUgYmFsbG9vbiBjYXRlZ29yeSBmcm9tIHRoZSBjYXRlZ29yeSBzZWxlY3RvciAod2hlbiBjcmVhdGluZyBhXG4gICAgICAvLyB0b3BpYylcbiAgICAgIHN0eWxlLnNoZWV0Lmluc2VydFJ1bGUoXG4gICAgICAgIGBodG1sLmRwZy5kcGctaGlkZS1iYWxsb29uLWNhdCAuY2F0ZWdvcnktY2hvb3NlciAuY2F0ZWdvcnktcm93W2RhdGEtbmFtZT1cIiR7bmFtZX1cIl0geyBkaXNwbGF5OiBub25lOyB9YFxuICAgICAgKVxuXG4gICAgICAvLyBEaXNhYmxlIHRoZSBcIk5ldyBUb3BpY1wiIGJ1dHRvbiBhbmQgaGlkZSB0aGUgXCJUaGVyZSBhcmUgbm8gbW9yZSBQb3NzXG4gICAgICAvLyB0b3BpY3MuV2h5IG5vdCBjcmVhdGUgYSB0b3BpYyA/IFwiIG1lc3NhZ2UgaW4gdGhlIGJhbGxvb24gY2F0ZWdvcnkgcGFnZS5cbiAgICAgIGNvbnN0IHBhcmVudENhdGVnb3J5ID0gdHJpZ2dlckNhdFsncGFyZW50Q2F0ZWdvcnknXVxuICAgICAgaWYgKHBhcmVudENhdGVnb3J5KSB7XG4gICAgICAgIGNvbnN0IHBhcmVudFNsdWcgPSBwYXJlbnRDYXRlZ29yeVsnc2x1ZyddXG4gICAgICAgIC8qIEZJWCBGT1IgSVNTVUUgIzI0XG4gICAgICAgIHN0eWxlLnNoZWV0Lmluc2VydFJ1bGUoXG4gICAgICAgICAgYGh0bWwuZHBnIGJvZHkuY2F0ZWdvcnktJHtwYXJlbnRTbHVnfSBidXR0b24jY3JlYXRlLXRvcGljIHsgb3BhY2l0eTogMC41OyBwb2ludGVyLWV2ZW50czogbm9uZTsgfWBcbiAgICAgICAgKVxuICAgICAgICBzdHlsZS5zaGVldC5pbnNlcnRSdWxlKFxuICAgICAgICAgIGBodG1sLmRwZyBib2R5LmNhdGVnb3J5LSR7cGFyZW50U2x1Z30gLnRvcGljLWxpc3QtYm90dG9tIC5mb290ZXItbWVzc2FnZSB7IGRpc3BsYXk6IG5vbmU7IH1gXG4gICAgICAgIClcbiAgICAgICAgKi9cbiAgICAgICAgc3R5bGUuc2hlZXQuaW5zZXJ0UnVsZShcbiAgICAgICAgICBgaHRtbC5kcGcgYm9keS5jYXRlZ29yeS0ke3BhcmVudFNsdWd9LSR7c2x1Z30gYnV0dG9uI2NyZWF0ZS10b3BpYyB7IG9wYWNpdHk6IDAuNTsgcG9pbnRlci1ldmVudHM6IG5vbmU7IH1gXG4gICAgICAgIClcbiAgICAgICAgc3R5bGUuc2hlZXQuaW5zZXJ0UnVsZShcbiAgICAgICAgICBgaHRtbC5kcGcgYm9keS5jYXRlZ29yeS0ke3BhcmVudFNsdWd9LSR7c2x1Z30gLnRvcGljLWxpc3QtYm90dG9tIC5mb290ZXItbWVzc2FnZSB7IGRpc3BsYXk6IG5vbmU7IH1gXG4gICAgICAgIClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0eWxlLnNoZWV0Lmluc2VydFJ1bGUoXG4gICAgICAgICAgYGh0bWwuZHBnIGJvZHkuY2F0ZWdvcnktJHtzbHVnfSBidXR0b24jY3JlYXRlLXRvcGljIHsgb3BhY2l0eTogMC41OyBwb2ludGVyLWV2ZW50czogbm9uZTsgfWBcbiAgICAgICAgKVxuICAgICAgICBzdHlsZS5zaGVldC5pbnNlcnRSdWxlKFxuICAgICAgICAgIGBodG1sLmRwZyBib2R5LmNhdGVnb3J5LSR7c2x1Z30gLnRvcGljLWxpc3QtYm90dG9tIC5mb290ZXItbWVzc2FnZSB7IGRpc3BsYXk6IG5vbmU7IH1gXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgaWYgKGFwcEN0cmwuc2l0ZVNldHRpbmdzWydkaXNjcGFnZV9oaWRlX3N1Z2dfdG9waWNzJ10pIHtcbiAgICBjbGFzc2VzICs9ICcgZHBnLWRpc2FibGUtc3VnZydcbiAgfVxuICBpZiAoYXBwQ3RybC5zaXRlU2V0dGluZ3NbJ2Rpc2NwYWdlX2hpZGVfdGFncyddKSB7XG4gICAgY2xhc3NlcyArPSAnIGRwZy1oaWRlLXRhZ3MnXG4gIH1cblxuICAkKCdodG1sJykuYWRkQ2xhc3MoY2xhc3NlcylcblxuICAkKCdib2R5JykucHJlcGVuZChgXG4gICAgPGRpdiBpZD1cImRwZy1naG9zdFwiPlxuICAgICAgPGRpdiBjbGFzcz1cImRwZy1naG9zdC1zcGxpdGJhclwiPjwvZGl2PlxuICAgIDwvZGl2PlxuICAgIDxkaXYgaWQ9XCJkcGctY29udGFpbmVyXCI+XG4gICAgICA8IS0tIDxkaXYgaWQ9XCJkcGctaW9zLXdyYXBwZXJcIiB0YWJpbmRleD1cIjBcIj4gLS0+XG4gICAgICAgIDxkaXYgaWQ9XCJkcGctbGVmdFwiIHRhYmluZGV4PVwiMFwiPlxuICAgICAgICAgIDwhLS1cbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibG9hZGluZy1jb250YWluZXIgdmlzaWJsZSBlbWJlci12aWV3XCI+ICAgIFxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3Bpbm5lciBcIj48L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PiAgICAgIFxuICAgICAgICAgIDwvZGl2PiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAtLT5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDwhLS0gPC9kaXY+IC0tPlxuICAgICAgPGRpdiBpZD1cImRwZy1zcGxpdGJhclwiPlxuICAgICAgICA8ZGl2IHN0eWxlPVwiZmxleDoxIDAgMFwiPjwvZGl2PlxuICAgICAgICA8ZGl2IGlkPVwiZHBnLXNwbGl0YmFyLXRleHRcIj4mZ3Q7PC9kaXY+XG4gICAgICAgIDxkaXYgc3R5bGU9XCJmbGV4OjEgMCAwXCI+PC9kaXY+XG4gICAgICA8L2Rpdj5cbiAgICA8L2Rpdj5cbiAgYClcblxuICAkKCcjbWFpbi1vdXRsZXQtd3JhcHBlcicpLndyYXAoJzxkaXYgaWQ9XCJkcGctcmlnaHRcIj48L2Rpdj4nKVxuXG4gIGNvbnRhaW5lci5kY3NMYXlvdXQgPSBuZXcgRGNzTGF5b3V0KGFwcEN0cmwsIHBhZ2VDYXRzKVxuXG4gIC8vIFByZXZlbnQgc2Nyb2xsaW5nIG9mIHRoZSBEaXNjb3Vyc2UgcGFnZSAocmlnaHQpIHdoZW4gc2Nyb2xsaW5nIGV2ZW50IG9uXG4gIC8vIHRoZSBsZWZ0IHJlYWNoZXMgdG9wIG9yIGJvdHRvbS5cbiAgLy8gTm90aWNlIHRoYXQgdGhlIFwic2Nyb2xsXCIgZXZlbnRzIGZpcmVzICphZnRlciogc2Nyb2xsaW5nIGhhcyBiZWVuIGRvbmUuXG4gIC8vIEhvdyB0byBjb21wdXRlIHNjcm9sbFRvcE1heDogaHR0cHM6Ly9hc2tjb2Rlei5jb20vY29tbWVudC1vYnRlbmlyLWxhLXZhbGV1ci1tYXhpbWFsZS1kdS1zY3JvbGx0b3AtZHUtZG9jdW1lbnQuaHRtbFxuICBmdW5jdGlvbiBoYW5kbGVTY3JvbGxVcChlKSB7XG4gICAgaWYgKGNvbnRhaW5lci5kY3NMYXlvdXQubGVmdC5zY3JvbGxUb3AgPT09IDApIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBoYW5kbGVTY3JvbGxEb3duKGUsIHNjcm9sbERpcmVjdGlvbikge1xuICAgIGNvbnN0IGxlZnQgPSBjb250YWluZXIuZGNzTGF5b3V0LmxlZnRcbiAgICAvLyAtMSBpcyBpbXBvcnRhbnRcbiAgICBjb25zdCBzY3JvbGxUb3BNYXggPSBsZWZ0LnNjcm9sbEhlaWdodCAtIGxlZnQuY2xpZW50SGVpZ2h0IC0gMVxuICAgIGlmIChsZWZ0LnNjcm9sbFRvcCA+PSBzY3JvbGxUb3BNYXgpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoKVxuICAgIH1cbiAgfVxuICBjb250YWluZXIuZGNzTGF5b3V0LmxlZnQuYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAnd2hlZWwnLFxuICAgIGUgPT4ge1xuICAgICAgaWYgKGUuZGVsdGFZIDwgMCkge1xuICAgICAgICBoYW5kbGVTY3JvbGxVcChlKVxuICAgICAgfSBlbHNlIGlmIChlLmRlbHRhWSA+IDApIHtcbiAgICAgICAgaGFuZGxlU2Nyb2xsRG93bihlKVxuICAgICAgfVxuICAgIH0sXG4gICAgeyBwYXNzaXZlOiBmYWxzZSB9IC8vIFBhc3NpdmUgaXMgdHJ1ZSBieSBkZWZhdWx0IG9uIGFsbCBzY3JvbGwtcmVsYXRlZCBldmVudHMgdW5kZXIgQ2hyb21lIGFuZCBGaXJlZm94XG4gIClcbiAgY29udGFpbmVyLmRjc0xheW91dC5sZWZ0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlID0+IHtcbiAgICBpZiAoZS5zaGlmdEtleSB8fCBlLmFsdEtleSB8fCBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGUuY29kZSA9PT0gJ0Fycm93VXAnIHx8IGUuY29kZSA9PT0gJ1BhZ2VVcCcpIHtcbiAgICAgIGhhbmRsZVNjcm9sbFVwKGUpXG4gICAgfVxuICAgIGlmIChlLmNvZGUgPT09ICdBcnJvd0Rvd24nIHx8IGUuY29kZSA9PT0gJ1BhZ2VEb3duJykge1xuICAgICAgaGFuZGxlU2Nyb2xsRG93bihlKVxuICAgIH1cbiAgfSlcblxuICBjb25zdCByb3V0ZXIgPSBjb250YWluZXIubG9va3VwKCdyb3V0ZXI6bWFpbicpXG5cbiAgLy8gU2V0IGEgY2xpY2sgaGFuZGxlciBvbiB0aGUgc3BsaXQgYmFyXG4gICQoJyNkcGctc3BsaXRiYXInKS5jbGljayhmdW5jdGlvbigpIHtcbiAgICBjb25zdCBzaG93UmlnaHQgPSAhY29udGFpbmVyLmRjc0xheW91dC5nZXRTaG93UmlnaHRRUCgpXG4gICAgcm91dGVyLnRyYW5zaXRpb25Ubyh7IHF1ZXJ5UGFyYW1zOiB7IFsnc2hvd1JpZ2h0J106IHNob3dSaWdodCB9IH0pXG4gIH0pXG5cbiAgLy8gU2V0IGEgY2xpY2sgaGFuZGxlciBvbiB0aGUgc3RhdGljIHBhZ2UsIGZvciBkZXNlbGVjdGlvblxuICBjb250YWluZXIuZGNzTGF5b3V0LmxlZnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHtcbiAgICBpZiAoY29udGFpbmVyLmRjc0xheW91dC5sYXlvdXQgPT09IDIgfHwgY29udGFpbmVyLmRjc0xheW91dC5sYXlvdXQgPT09IDMpIHtcbiAgICAgIC8vIERvbid0IGRlc2VsZWN0IGluIGNhc2Ugb2YgY3RybCtjbGljayBvciBzaGlmdCtjbGljayAodXNlZnVsIHdoZW4gdXNlclxuICAgICAgLy8gY2xpY2tzIG9uIGEgbGluayBvciBpcyBzZWxlY3RpbmcgdGV4dClcbiAgICAgIGlmIChlLnNoaWZ0S2V5IHx8IGUuY3RybEtleSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgLy8gRG9uJ3QgZGVzZWxlY3Qgd2hlbiB1c2VyIGlzIHNlbGVjdGluZyB0ZXh0XG4gICAgICBpZiAod2luZG93LmdldFNlbGVjdGlvbigpLnRvU3RyaW5nKCkpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIC8vIERvbid0IGRlc2VsZWN0IGlmIHVzZXIgaGFzIGNsaWNrZWQgb24gYW4gaW1hZ2VcbiAgICAgIGlmIChlLnRhcmdldC5jbG9zZXN0KCcubGlnaHRib3gtd3JhcHBlcicpKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICAvLyBEb24ndCBkZXNlbGVjdCBpZiB1c2VyIGhhcyBjbGlja2VkIG9uIGEgZGlzY3BhZ2UgYnV0dG9uXG4gICAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnLmRwZy1idXR0b25zJykpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIC8vIERlc2VsZWN0XG4gICAgICByb3V0ZXIudHJhbnNpdGlvblRvKGAvdC8ke2NvbnRhaW5lci5kY3NMYXlvdXQucGFnZUlkfWApXG4gICAgfVxuICB9KVxuXG4gIGZ1bmN0aW9uIGRpc2NQYWdlT25PZmYoKSB7XG4gICAgJCgnaHRtbCcpLnRvZ2dsZUNsYXNzKCdkcGcnKVxuICB9XG5cbiAgLy8gQ2xpY2sgaGFuZGxlIGZvciB0aGUgXCJEaXNjUGFnZSBPbi9PZmZcIiBoYW1idXJnZXIgbWVudSBpdGVtXG4gIC8vIChub3QgcmVuZGVyZWQgeWV0IGF0IHRoaXMgcG9pbnQgaW4gdGltZSlcbiAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHtcbiAgICBpZiAoZS50YXJnZXQuY2xvc2VzdCgnLmRwZy1vbi1vZmYnKSkge1xuICAgICAgZGlzY1BhZ2VPbk9mZigpXG4gICAgfVxuICB9KVxuXG4gIC8vIFNldCB0aGUgXCJhbHQrYVwiIGhvdGtleSBmb3IgZGVidWcgZGlzcGxheVxuICAvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMjg3OTA5NS8zNTY3MzUxXG4gICQoZG9jdW1lbnQpLmtleWRvd24oZnVuY3Rpb24oZSkge1xuICAgIC8vIEFsdCthXG4gICAgaWYgKGVbJ2tleUNvZGUnXSA9PT0gNjUgJiYgZVsnYWx0S2V5J10pIHtcbiAgICAgIGNvbnN0IHVzZXIgPSBVc2VyLmN1cnJlbnQoKVxuICAgICAgaWYgKHVzZXIgJiYgdXNlclsnYWRtaW4nXSkge1xuICAgICAgICBkaXNjUGFnZU9uT2ZmKClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHUubG9nKGBPbmx5IGFkbWlucyBjYW4gZG8gdGhhdGApXG4gICAgICB9XG4gICAgfVxuICB9KVxufVxuIiwiaW1wb3J0IHsgdSB9IGZyb20gJy4vdXRpbHMnXHJcbmltcG9ydCB7IERwZ1RhZyB9IGZyb20gJy4vRHBnVGFnLmpzJ1xyXG4vL2ltcG9ydCBVc2VyIGZyb20gJ2Rpc2NvdXJzZS9tb2RlbHMvdXNlcidcclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG5leHBvcnQgZnVuY3Rpb24gb25EaWRUcmFuc2l0aW9uKHtcclxuICBjb250YWluZXIsXHJcbiAgcm91dGVOYW1lLFxyXG4gIHF1ZXJ5UGFyYW1zT25seSxcclxuICBwYWdlQ2F0SWRzLFxyXG4gIHRyaWdnZXJDYXRzXHJcbn0pIHtcclxuICAvL2NvbnNvbGUubG9nKCdvbkRpZFRyYW5zaXRpb246ICcsIHJvdXRlTmFtZSlcclxuXHJcbiAgLy8gSW4gY2FzZSBvZiBhIHRvcGljIHRoYXQgaXMgbm90IGEgUGFnZSwgd2Ugd2lsbCBuZWVkIHRvIGNoZWNrIGl0cyB0YWdzLiBCdXRcclxuICAvLyB0YWdzIGFyZSBub3QgYWx3YXlzIHRoZXJlLCBzbyB3ZSBuZWVkIHRvIHdhaXQgYSBiaXQuXHJcblxyXG4gIGlmIChyb3V0ZU5hbWUuc3RhcnRzV2l0aCgndG9waWMuJykpIHtcclxuICAgIC8vIEdldCB0aGUgbW9kZWxcclxuICAgIGNvbnN0IHJvdXRlID0gY29udGFpbmVyLmxvb2t1cCgncm91dGU6dG9waWMnKVxyXG4gICAgY29uc3QgbW9kZWwgPSByb3V0ZS5tb2RlbEZvcigndG9waWMnKVxyXG5cclxuICAgIC8vIENhc2Ugbm90IGEgc3RhdGljIHBhZ2VcclxuICAgIGlmICghcGFnZUNhdElkcy5pbmNsdWRlcyhtb2RlbC5nZXQoJ2NhdGVnb3J5X2lkJykpKSB7XHJcbiAgICAgIC8vIFdhaXQgZm9yIHRoZSBcInRhZ3NcIiBmaWVsZC4gVGhlIFwidGFnc1wiIGZpZWxkIGlzIG5vdCBhbHdheXMgdGhlcmVcclxuICAgICAgLy8gaW1tZWRpYXRlbHksIGVzcGVjaWFsbHkgd2hlbiBjcmVhdGluZyBhIG5ldyB0b3BpY1xyXG4gICAgICAvLyAxNXgyMDAgPSAzcyB0b3RhbC5UcmllZCAxLDVzIGJlZm9yZSAtPiBub3QgZW5vdWdoLlxyXG4gICAgICBjb25zdCBoYXNUYWdzUHJvcCA9ICgpID0+IG1vZGVsLmhhc093blByb3BlcnR5KCd0YWdzJylcclxuICAgICAgdS5hc3luYy5yZXRyeURlbGF5KGhhc1RhZ3NQcm9wLCAxNSwgMjAwKS50aGVuKFxyXG4gICAgICAgICgpID0+IHtcclxuICAgICAgICAgIG9uRGlkVHJhbnNpdGlvbjIoe1xyXG4gICAgICAgICAgICBjb250YWluZXIsXHJcbiAgICAgICAgICAgIHJvdXRlTmFtZSxcclxuICAgICAgICAgICAgcXVlcnlQYXJhbXNPbmx5LFxyXG4gICAgICAgICAgICBwYWdlQ2F0SWRzLFxyXG4gICAgICAgICAgICB0cmlnZ2VyQ2F0c1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9LFxyXG4gICAgICAgICgpID0+IHtcclxuICAgICAgICAgIC8vIFByb3BlcnR5IFwidGFnc1wiIG5vdCBmb3VuZCBpbiB0b3BpYyBtb2RlbCcuIFRoaXMgaGFwcGVucyB3aGVuIHRvcGljXHJcbiAgICAgICAgICAvLyBoYXMgbm8gdGFncy4gU2hvdyB0aGUgbm9ybWFsIERpc2NvdXJzZS5cclxuICAgICAgICAgIGNvbnRhaW5lci5kY3NMYXlvdXQuc2V0TGF5b3V0KDEpXHJcbiAgICAgICAgfVxyXG4gICAgICApXHJcblxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICB9XHJcblxyXG4gIG9uRGlkVHJhbnNpdGlvbjIoe1xyXG4gICAgY29udGFpbmVyLFxyXG4gICAgcm91dGVOYW1lLFxyXG4gICAgcXVlcnlQYXJhbXNPbmx5LFxyXG4gICAgcGFnZUNhdElkcyxcclxuICAgIHRyaWdnZXJDYXRzXHJcbiAgfSlcclxufVxyXG5cclxuZnVuY3Rpb24gb25EaWRUcmFuc2l0aW9uMih7XHJcbiAgY29udGFpbmVyLFxyXG4gIHJvdXRlTmFtZSxcclxuICBxdWVyeVBhcmFtc09ubHksXHJcbiAgcGFnZUNhdElkcyxcclxuICB0cmlnZ2VyQ2F0c1xyXG59KSB7XHJcbiAgLy9jb25zb2xlLmxvZygnb25EaWRUcmFuc2l0aW9uMjogJywgcm91dGVOYW1lKVxyXG5cclxuICBjb25zdCAkaHRtbCA9ICQoJ2h0bWwnKVxyXG4gICRodG1sLnJlbW92ZUNsYXNzKCdkcGctcGFnZSBkcGctdGFnIGRwZy10b3BpYyBkcGctY29tbWVudCBkcGctZGlzY3VzcycpXHJcbiAgJGh0bWwucmVtb3ZlQXR0cignZGF0YS1kcGctcGFnZS1pZCcpXHJcblxyXG4gIC8vKioqKiB0b3BpYyByb3V0ZSAqKioqXHJcbiAgaWYgKHJvdXRlTmFtZS5zdGFydHNXaXRoKCd0b3BpYy4nKSkge1xyXG4gICAgY29uc3Qgcm91dGUgPSBjb250YWluZXIubG9va3VwKCdyb3V0ZTp0b3BpYycpXHJcbiAgICBjb25zdCBtb2RlbCA9IHJvdXRlWydjdXJyZW50TW9kZWwnXVxyXG5cclxuICAgIC8vIENhc2Ugc3RhdGljIFBhZ2VcclxuICAgIGlmIChwYWdlQ2F0SWRzLmluY2x1ZGVzKG1vZGVsLmdldCgnY2F0ZWdvcnlfaWQnKSkpIHtcclxuICAgICAgJGh0bWwuYWRkQ2xhc3MoYGRwZy1wYWdlYClcclxuICAgICAgJGh0bWwuYXR0cignZGF0YS1kcGctcGFnZS1pZCcsIG1vZGVsLmdldCgnaWQnKSlcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgdGhlIHRhZ3NcclxuICAgIGNvbnN0IHRhZ3MgPSBtb2RlbC5nZXQoJ3RhZ3MnKSB8fCBbXVxyXG4gICAgbGV0IHBhcnNlZFxyXG4gICAgY29uc3QgZHBnVGFnID0gdGFncy5maW5kKHRhZyA9PiB7XHJcbiAgICAgIHBhcnNlZCA9IERwZ1RhZy5wYXJzZSh0YWcpXHJcbiAgICAgIHJldHVybiAhIXBhcnNlZFxyXG4gICAgfSlcclxuXHJcbiAgICAvLyBDYXNlIHRvcGljIG9mIGEgdHJpZ2dlclxyXG4gICAgaWYgKGRwZ1RhZykge1xyXG4gICAgICBjb25zdCB7IHBhZ2VJZCwgdHJpZ2dlcklkIH0gPSBwYXJzZWRcclxuICAgICAgY29uc3QgbGF5b3V0ID0gY29udGFpbmVyLmRjc0xheW91dC5nZXRTaG93UmlnaHRRUCgpID8gMyA6IDJcclxuICAgICAgY29udGFpbmVyLmRjc0xheW91dC5maWxsTGVmdCh7IHBhZ2VJZCwgc2VsVHJpZ2dlcklkOiB0cmlnZ2VySWQgfSlcclxuICAgICAgY29uc3QgaXNDb21tZW50TW9kZSA9IGZhbHNlXHJcbiAgICAgIGNvbnN0IG1vZGVDbGFzcyA9IGlzQ29tbWVudE1vZGUgPyAnZHBnLWNvbW1lbnQnIDogJ2RwZy1kaXNjdXNzJ1xyXG4gICAgICAkaHRtbC5hZGRDbGFzcyhgZHBnLXRvcGljICR7bW9kZUNsYXNzfWApXHJcbiAgICAgICRodG1sLmF0dHIoJ2RhdGEtZHBnLXBhZ2UtaWQnLCBwYWdlSWQpXHJcbiAgICAgIGlmICghcXVlcnlQYXJhbXNPbmx5KSB7XHJcbiAgICAgICAgYWZ0ZXJSZW5kZXIoKS50aGVuKCgpID0+IG1vZGlmeVRvcGljUGFnZShkcGdUYWcsIGlzQ29tbWVudE1vZGUpKVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnRhaW5lci5kY3NMYXlvdXQuc2V0TGF5b3V0KGxheW91dClcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyoqKiogVGFnIHJvdXRlICoqKipcclxuICBpZiAocm91dGVOYW1lID09PSAndGFnLnNob3cnKSB7XHJcbiAgICBjb25zdCByb3V0ZSA9IGNvbnRhaW5lci5sb29rdXAoJ3JvdXRlOnRhZy5zaG93JylcclxuICAgIGNvbnN0IG1vZGVsID0gcm91dGVbJ2N1cnJlbnRNb2RlbCddXHJcbiAgICBjb25zdCBwYXJzZWQgPSBEcGdUYWcucGFyc2UobW9kZWxbJ3RhZyddWydpZCddKVxyXG4gICAgaWYgKHBhcnNlZCkge1xyXG4gICAgICBjb25zdCBpc0NvbW1lbnRNb2RlID0gZmFsc2UgLy9tb2RlbC5nZXQoJ2lkJykgPT09ICdkcGctY29tbWVudCdcclxuICAgICAgY29uc3QgbW9kZUNsYXNzID0gaXNDb21tZW50TW9kZSA/ICdkcGctY29tbWVudCcgOiAnZHBnLWRpc2N1c3MnXHJcbiAgICAgICRodG1sLmFkZENsYXNzKGBkcGctdGFnICR7bW9kZUNsYXNzfWApXHJcbiAgICAgICRodG1sLmF0dHIoJ2RhdGEtZHBnLXBhZ2UtaWQnLCBwYXJzZWQucGFnZUlkKVxyXG5cclxuICAgICAgaWYgKCFxdWVyeVBhcmFtc09ubHkpIHtcclxuICAgICAgICAvLyBDcmVhdGUgdGhlIHN0YXRpYyBwYWdlIHZpZXdcclxuICAgICAgICBjb250YWluZXIuZGNzTGF5b3V0LmZpbGxMZWZ0KHtcclxuICAgICAgICAgIHBhZ2VJZDogcGFyc2VkLnBhZ2VJZCxcclxuICAgICAgICAgIHNlbFRyaWdnZXJJZDogcGFyc2VkLnRyaWdnZXJJZFxyXG4gICAgICAgIH0pXHJcblxyXG4gICAgICAgIC8vIFNldCB0aGUgcmlnaHQgY2F0ZWdvcnkgaW4gdGhlIGNvbXBvc2VyXHJcbiAgICAgICAgaWYgKHRyaWdnZXJDYXRzKSB7XHJcbiAgICAgICAgICBjb25zdCB0YWdzU2hvd0N0cmwgPSBjb250YWluZXIubG9va3VwKCdjb250cm9sbGVyOnRhZy1zaG93JylcclxuICAgICAgICAgIGlmICh0cmlnZ2VyQ2F0cy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICAgICAgdGFnc1Nob3dDdHJsLnNldCgnY2F0ZWdvcnknLCB0cmlnZ2VyQ2F0c1swXSlcclxuICAgICAgICAgICAgdGFnc1Nob3dDdHJsLnNldCgnY2FuQ3JlYXRlVG9waWNPbkNhdGVnb3J5JywgdHJ1ZSlcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIENhc2UgdGhlcmUgYXJlIG1vcmUgdGhhbiBvbmUgY2F0ZWdvcnkgdG8gY2hvb3NlIGZyb206IHdlIHdpbGxcclxuICAgICAgICAgICAgLy8gcGljayB0aGUgb25lIFwiY2xvc2VzdFwiIHRvIHRoZSBwYWdlIGNhdGVnb3J5XHJcbiAgICAgICAgICAgIGdldChgL3QvJHtwYXJzZWQucGFnZUlkfS5qc29uYCkudGhlbih0b3BpYyA9PiB7XHJcbiAgICAgICAgICAgICAgLy8gR2V0IHRoZSBwYWdlIGNhdGVnb3J5XHJcbiAgICAgICAgICAgICAgY29uc3QgcGFnZUNhdElkID0gdG9waWNbJ2NhdGVnb3J5X2lkJ11cclxuICAgICAgICAgICAgICBjb25zdCBhcHBDdHJsID0gY29udGFpbmVyLmxvb2t1cCgnY29udHJvbGxlcjphcHBsaWNhdGlvbicpXHJcbiAgICAgICAgICAgICAgY29uc3QgcGFnZUNhdCA9IGFwcEN0cmwuc2l0ZS5jYXRlZ29yaWVzLmZpbmQoXHJcbiAgICAgICAgICAgICAgICBjID0+IGNbJ2lkJ10gPT09IHBhZ2VDYXRJZFxyXG4gICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICBjb25zdCBwYWdlUGFyZW50Q2F0SWQgPSBwYWdlQ2F0WydwYXJlbnRfY2F0ZWdvcnlfaWQnXVxyXG5cclxuICAgICAgICAgICAgICAvLyBDaG9vc2UgYSBiYWxsb29uIGNhdGVnb3J5IGluIHRoZSBsaXN0LiBUYWtlIHRoZSBmaXJzdCBjYXRlZ29yeVxyXG4gICAgICAgICAgICAgIC8vIGluIHRoZSBsaXN0IHdoaWNoIGlzIGVpdGhlcjpcclxuICAgICAgICAgICAgICAvLyAtIGEgc2libGluZyBvZiB0aGUgcGFnZSBjYXRlZ29yeSAoc2FtZSBpbW1lZGlhdGUgcGFyZW50KVxyXG4gICAgICAgICAgICAgIC8vIC0gdGhlIGltbWVkaWF0ZSBwYXJlbnQgb2YgdGhlIHBhZ2UgY2F0ZWdvcnlcclxuICAgICAgICAgICAgICAvLyBJZiBub3QgZm91bmQsIHRha2UgdGhlIGZpcnN0IGNhdGVnb3J5LlxyXG4gICAgICAgICAgICAgIGNvbnN0IHRyaWdnZXJDYXQgPVxyXG4gICAgICAgICAgICAgICAgKHBhZ2VQYXJlbnRDYXRJZCAmJlxyXG4gICAgICAgICAgICAgICAgICB0cmlnZ2VyQ2F0cy5maW5kKFxyXG4gICAgICAgICAgICAgICAgICAgIHRjID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICB0Y1sncGFyZW50X2NhdGVnb3J5X2lkJ10gPT09IHBhZ2VQYXJlbnRDYXRJZCB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgdGNbJ2lkJ10gPT09IHBhZ2VQYXJlbnRDYXRJZFxyXG4gICAgICAgICAgICAgICAgICApKSB8fFxyXG4gICAgICAgICAgICAgICAgdHJpZ2dlckNhdHNbMF1cclxuXHJcbiAgICAgICAgICAgICAgLy8gc2V0IHRoZSBjYXRlZ29yeSBpbiB0aGUgY29tcG9zZXJcclxuICAgICAgICAgICAgICB0YWdzU2hvd0N0cmwuc2V0KCdjYXRlZ29yeScsIHRyaWdnZXJDYXQpXHJcbiAgICAgICAgICAgICAgdGFnc1Nob3dDdHJsLnNldCgnY2FuQ3JlYXRlVG9waWNPbkNhdGVnb3J5JywgdHJ1ZSlcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGFmdGVyUmVuZGVyKCkudGhlbigoKSA9PiBtb2RpZnlUYWdQYWdlKGlzQ29tbWVudE1vZGUpKVxyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IGxheW91dCA9IGNvbnRhaW5lci5kY3NMYXlvdXQuZ2V0U2hvd1JpZ2h0UVAoKSA/IDMgOiAyXHJcbiAgICAgIGNvbnRhaW5lci5kY3NMYXlvdXQuc2V0TGF5b3V0KGxheW91dClcclxuXHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLy8qKioqIE90aGVyIHJvdXRlcyAqKioqXHJcbiAgY29udGFpbmVyLmRjc0xheW91dC5zZXRMYXlvdXQoMSlcclxufVxyXG5cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmZ1bmN0aW9uIG1vZGlmeVRhZ1BhZ2UoY29tbWVudE1vZGUpIHtcclxuICAvLyBDaGFuZ2UgdGhlIFwiTmV3IFRvcGljXCIgYnV0dG9uIHRvIFwiTmV3IENvbW1lbnRcIlxyXG4gIGlmIChjb21tZW50TW9kZSkge1xyXG4gICAgJCgnI2NyZWF0ZS10b3BpYyA+IC5kLWJ1dHRvbi1sYWJlbCcpLnRleHQoJ05ldyBDb21tZW50JylcclxuICB9XHJcblxyXG4gIC8vIElmIHRoZXJlIGlzIG5vIHRvcGljIGluIHRoZSB0YWcsIGRpc3BsYXkgXCJObyB0b3BpYyB5ZXRcIiwgZWxzZSByZW1vdmUgdGhlXHJcbiAgLy8gdXNlbGVzcyBtZXNzYWdlIHdoZW4gdGhlcmUgYXJlIHRvbyBmZXcgdG9waWNzOiBcIlRoZXJlIGFyZSBubyBsYXRlc3RcclxuICAvLyB0b3BpY3MuQnJvd3NlIGFsbCBjYXRlZ29yaWVzIG9yIHZpZXcgbGF0ZXN0IHRvcGljc1wiXHJcbiAgY29uc3QgZm9vdGVyID0gJCgnZm9vdGVyLnRvcGljLWxpc3QtYm90dG9tJylcclxuICBjb25zdCBub1RvcGljID0gISQoJ3RhYmxlLnRvcGljLWxpc3QnKS5sZW5ndGhcclxuICBpZiAobm9Ub3BpYykge1xyXG4gICAgZm9vdGVyLmh0bWwoYFxyXG4gICAgICA8ZGl2IHN0eWxlPVwibWFyZ2luLWxlZnQ6MTJweFwiPlxyXG4gICAgICAgIDxwPjxpPk5vICR7Y29tbWVudE1vZGUgPyAnY29tbWVudCcgOiAndG9waWMnfSB5ZXQ8L2k+PC9wPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIGApXHJcbiAgfSBlbHNlIHtcclxuICAgIGZvb3Rlci5odG1sKCcnKVxyXG4gIH1cclxufVxyXG5cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmZ1bmN0aW9uIG1vZGlmeVRvcGljUGFnZShkcGdUYWcsIGNvbW1lbnRNb2RlKSB7XHJcbiAgaWYgKGNvbW1lbnRNb2RlKSB7XHJcbiAgfSBlbHNlIHtcclxuICAgIC8vIEFkZCB0aGUgXCJiYWNrXCIgbGlua1xyXG4gICAgLy8gV0FSTklORzogaWYgd2UgYWxyZWFkeSB3ZXJlIG9uIGEgZGNzIHRvcGljIHBhZ2UsIHRoZSBcImJhY2tcIlxyXG4gICAgLy8gbGluayBpcyBhbHJlYWR5IHRoZXJlLiBUaGlzIGhhcHBlbnMgd2hlbiB1c2luZyB0aGUgXCJTdWdnZXN0ZWQgVG9waWNzXCIgbGlzdFxyXG4gICAgLy8gYXQgdGhlIGJvdHRvbSBvbiBhIHRvcGljIChhZG1pbiBtb2RlIG9ubHksIEkgdGhpbmspXHJcbiAgICBpZiAoISQoJyNkcGctYmFjaycpLmxlbmd0aCkge1xyXG5cclxuICAgICAgJCgnI3RvcGljLXRpdGxlIC50aXRsZS13cmFwcGVyJykuYXBwZW5kKGBcclxuICAgICAgICA8ZGl2IGlkPVwiZHBnLWJhY2tcIj5cclxuICAgICAgICAgIDxhIGhyZWY9XCIvdGFnLyR7ZHBnVGFnfVwiPlxyXG4gICAgICAgICAgICAmIzg2MzA7IEJhY2sgdG8gdG9waWMgbGlzdFxyXG4gICAgICAgICAgPC9hPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICBgKVxyXG5cclxuICAgICAgLypcclxuICAgICAgJCgnI21haW4tb3V0bGV0ID4gLmVtYmVyLXZpZXdbY2xhc3MqPVwiY2F0ZWdvcnktXCJdJykucHJlcGVuZChgXHJcbiAgICAgICAgPGRpdiBpZD1cImRwZy1iYWNrXCIgY2xhc3M9XCJsaXN0LWNvbnRyb2xzXCIgc3R5bGU9XCJwb3NpdGlvbjotd2Via2l0LXN0aWNreTsgcG9zaXRpb246c3RpY2t5OyB0b3A6NzBweDsgei1pbmRleDoxMDAwOyB0ZXh0LWFsaWduOnJpZ2h0OyBtYXJnaW4tYm90dG9tOi0xMHB4XCI+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzPVwiY29udGFpbmVyXCI+XHJcbiAgICAgICAgICAgIDxhIHN0eWxlPVwicGFkZGluZzo1cHg7IGJhY2tncm91bmQtY29sb3I6d2hpdGVcIiBocmVmPVwiL3RhZy8ke2RwZ1RhZ31cIj5cclxuICAgICAgICAgICAgICAmIzg2MzA7IEJhY2sgdG8gdG9waWMgbGlzdFxyXG4gICAgICAgICAgICA8L2E+XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgYClcclxuICAgICAgKi9cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vKlxyXG4vLyBDQVJFRlVMOiB3aGVuIHJlZGlyZWN0aW5nIGEgcm91dGUgY2hhbmdlIChmb3IgZXhhbXBsZSB3aXRoaW4gd2lsbFRyYW5zaXRpb24pLFxyXG4vLyBhbHdheXMgdXNlIHRoZSBzYW1lIG1ldGhvZCBhcyB0aGUgb3JpZ2luYWwgdHJhbnNpdGlvbiwgb3RoZXJ3aXNlIHN0cmFuZ2UgYnVnc1xyXG4vLyBvY2N1ci4gRm9yIGV4YW1wbGUsIGlmIGluIGEgdHJhbnNpdGlvblRvKCkgeW91IHJlZGlyZWN0IHdpdGggcmVwbGFjZVdpdGgoKSxcclxuLy8geW91IGVyYXNlIHRoZSBwcmV2aW91cyBlbnRyeSBpbiB0aGUgYnJvd3NlciBoaXN0b3J5ICFcclxuZnVuY3Rpb24gcmVkaXJlY3QoY29udGFpbmVyLCB0cmFuc2l0aW9uLCAuLi5hcmdzKSB7XHJcbiAgLy8gRG9uJ3QgdXNlIHRyYW5zaXRpb24ucm91dGVyIGhlcmUsIGl0IGlzIHdyb25nIChvciBub3QgdGhlIHJpZ2h0IG9uZSlcclxuICBjb25zdCByb3V0ZXIgPSBjb250YWluZXIubG9va3VwKCdyb3V0ZXI6bWFpbicpXHJcbiAgY29uc3QgZnVuID1cclxuICAgIHRyYW5zaXRpb24udXJsTWV0aG9kID09PSAncmVwbGFjZSdcclxuICAgICAgPyByb3V0ZXIucmVwbGFjZVdpdGhcclxuICAgICAgOiByb3V0ZXIudHJhbnNpdGlvblRvXHJcbiAgcmV0dXJuIGZ1bi5iaW5kKHJvdXRlcikoLi4uYXJncylcclxufVxyXG4qL1xyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuY29uc3QgYWZ0ZXJSZW5kZXIgPSByZXMgPT5cclxuICBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcclxuICAgIEVtYmVyLnJ1bi5zY2hlZHVsZSgnYWZ0ZXJSZW5kZXInLCBudWxsLCAoKSA9PiByZXNvbHZlKHJlcykpXHJcbiAgfSlcclxuXHJcbmNvbnN0IGdldCA9IHVybCA9PlxyXG4gIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICQuZ2V0KHVybCwgZGF0YSA9PiByZXNvbHZlKGRhdGEpKS5mYWlsKCgpID0+IHJlamVjdChgZ2V0IFwiJHt1cmx9XCIgZmFpbGVkYCkpXHJcbiAgfSlcclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiIsIi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmltcG9ydCBBcHBsaWNhdGlvblJvdXRlIGZyb20gJ2Rpc2NvdXJzZS9yb3V0ZXMvYXBwbGljYXRpb24nXG4vL2ltcG9ydCBUYWdzU2hvd1JvdXRlIGZyb20gJ2Rpc2NvdXJzZS9yb3V0ZXMvdGFncy1zaG93J1xuLy9pbXBvcnQgRGlzY291cnNlVVJMIGZyb20gJ2Rpc2NvdXJzZS9saWIvdXJsJ1xuLy9pbXBvcnQgQ29tcG9zZXJDb250cm9sbGVyIGZyb20gJ2Rpc2NvdXJzZS9jb250cm9sbGVycy9jb21wb3Nlcidcbi8vaW1wb3J0IENvbXBvc2VyIGZyb20gJ2Rpc2NvdXJzZS9tb2RlbHMvY29tcG9zZXInXG4vL2ltcG9ydCBUb3BpY05hdmlnYXRpb24gZnJvbSAnZGlzY291cnNlL2NvbXBvbmVudHMvdG9waWMtbmF2aWdhdGlvbidcbi8vaW1wb3J0IFNpdGVIZWFkZXJDb21wb25lbnQgZnJvbSAnZGlzY291cnNlL2NvbXBvbmVudHMvc2l0ZS1oZWFkZXInXG5pbXBvcnQgVG9waWNOYXZpZ2F0aW9uQ29tcG9uZW50IGZyb20gJ2Rpc2NvdXJzZS9jb21wb25lbnRzL3RvcGljLW5hdmlnYXRpb24nXG4vL2ltcG9ydCBUb3BpY1Byb2dyZXNzQ29tcG9uZW50IGZyb20gJ2Rpc2NvdXJzZS9jb21wb25lbnRzL3RvcGljLXByb2dyZXNzJ1xuaW1wb3J0IHsgb25BZnRlclJlbmRlciB9IGZyb20gJy4vb25BZnRlclJlbmRlci5qcydcbmltcG9ydCB7IG9uRGlkVHJhbnNpdGlvbiB9IGZyb20gJy4vb25EaWRUcmFuc2l0aW9uLmpzJ1xuLy9pZiAoRGlzY291cnNlLkVudmlyb25tZW50ID09PSAnZGV2ZWxvcG1lbnQnKSB7IH1cbi8vaW1wb3J0IHsgRHBnVGFnIH0gZnJvbSAnLi9EcGdUYWcuanMnXG4vL2ltcG9ydCB7IHNpbXBsaWZ5VG9waWNTdGF0ZXMgfSBmcm9tICcuL3NpbXBsaWZ5VG9waWNTdGF0ZXMuanMnXG5pbXBvcnQgeyB3aXRoUGx1Z2luQXBpIH0gZnJvbSAnZGlzY291cnNlL2xpYi9wbHVnaW4tYXBpJ1xuLy9pbXBvcnQgeyBkaXNjb3Vyc2VBUEkgfSBmcm9tICcuL2Rpc2NvdXJzZUFQSSdcbmltcG9ydCB7IHUgfSBmcm9tICcuL3V0aWxzLmpzJ1xuaW1wb3J0IFVzZXIgZnJvbSAnZGlzY291cnNlL21vZGVscy91c2VyJ1xuXG4vKipcbiAqIEBwYXJhbSB7RW1iZXJDb250YWluZXJ9IGNvbnRhaW5lclxuICogQHBhcmFtIHtFbWJlckFwcGxpY2F0aW9ufSBhcHBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluaXQoY29udGFpbmVyLCBhcHApIHtcbiAgY29uc3Qgc2l0ZVNldHRpbmdzID0gY29udGFpbmVyLmxvb2t1cCgnc2l0ZS1zZXR0aW5nczptYWluJylcblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICBjb25zdCB1c2VyID0gVXNlci5jdXJyZW50KClcbiAgY29uc3QgdXNlcklzQWRtaW4gPSB1c2VyICYmIHVzZXJbJ2FkbWluJ11cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBJZiBwbHVnaW4gaXMgZGlzYWJsZWQsIHF1aXRcbiAgaWYgKCFzaXRlU2V0dGluZ3NbJ2Rpc2NwYWdlX2VuYWJsZWQnXSkge1xuICAgIHJldHVyblxuICB9XG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRml4IGZvciBpc3N1ZSAjMTdcbiAgLy8gSWYgd2UgYXJlIGluIFwibG9naW4gcmVxdWlyZWRcIiBtb2RlIGJ1dCB0aGUgdXNlciBpcyBub3QgbG9nZ2VkLWluIHlldCwgcXVpdC5cbiAgLy8gSW5kZWVkLCBhdCB0aGlzIHN0YWdlIHdlIGRvbid0IGhhdmUgYWNjZXNzIHRvIGNhdGVnb3JpZXMsIGV0Yy4sIHNvIHdlJ2xsXG4gIC8vIHdhaXQgdW50aWwgdGhlIHVzZXIgaGFzIGxvZ2dlZCBpbiB0byByZWFsbHkgbGF1bmNoIERpc2NQYWdlLlxuICBpZiAoc2l0ZVNldHRpbmdzWydsb2dpbl9yZXF1aXJlZCddICYmICF1c2VyKSB7XG4gICAgcmV0dXJuXG4gIH1cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBDaGVjayB0aGUgdGFnZ2luZ19lbmFibGVkIHNldHRpbmdcbiAgaWYgKCFzaXRlU2V0dGluZ3NbJ3RhZ2dpbmdfZW5hYmxlZCddKSB7XG4gICAgc2V0dGluZ0Vycm9yKCd0YWdnaW5nX2VuYWJsZWQnLCAndGhpcyBtdXN0IGJlIHNldCB0byB0cnVlJylcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vIENoZWNrIHRoZSBkaXNjcGFnZV9wYWdlX2NhdGVnb3JpZXMgc2V0dGluZ1xuICBpZiAoIXNpdGVTZXR0aW5nc1snZGlzY3BhZ2VfcGFnZV9jYXRlZ29yaWVzJ10pIHtcbiAgICBzZXR0aW5nRXJyb3IoJ2Rpc2NwYWdlX3BhZ2VfY2F0ZWdvcmllcycsICdtaXNzaW5nIHNldHRpbmcnKVxuICAgIHJldHVyblxuICB9XG4gIGNvbnN0IHBhZ2VDYXRJZHMgPSBzaXRlU2V0dGluZ3NbJ2Rpc2NwYWdlX3BhZ2VfY2F0ZWdvcmllcyddXG4gICAgLnNwbGl0KCd8JylcbiAgICAubWFwKHN0ciA9PiBwYXJzZUludChzdHIpKVxuICBjb25zdCBhcHBDdHJsID0gY29udGFpbmVyLmxvb2t1cCgnY29udHJvbGxlcjphcHBsaWNhdGlvbicpXG4gIGxldCBlcnJvciA9IGZhbHNlXG4gIGNvbnN0IHBhZ2VDYXRzID0gcGFnZUNhdElkcy5yZWR1Y2UoKHJlcywgaWQpID0+IHtcbiAgICBjb25zdCBjYXQgPSBhcHBDdHJsLnNpdGUuY2F0ZWdvcmllcy5maW5kKGMgPT4gY1snaWQnXSA9PT0gaWQpXG4gICAgaWYgKGNhdCkge1xuICAgICAgcmVzLnB1c2goY2F0KVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBNYXliZSB0aGUgY2F0ZWdvcnkgaGFzIG5vdCBiZWVuIGZvdW5kIGJlY2F1c2UgdGhlIHVzZXIgaXMgbm90IGFsbG93ZWRcbiAgICAgIC8vIHRvIHNlZSBpdC4gT25seSB3aXRoIGFkbWlucyBhcmUgd2Ugc3VyZSB0aGVyZSdzIGFuIGVycm9yLiBGb3Igb3RoZXJcbiAgICAgIC8vIHVzZXJzLCBpdCBtaWdodCBiZSBub3JtYWwuXG4gICAgICBpZiAodXNlcklzQWRtaW4pIHtcbiAgICAgICAgc2V0dGluZ0Vycm9yKFxuICAgICAgICAgICdkaXNjcGFnZV9wYWdlX2NhdGVnb3JpZXMnLFxuICAgICAgICAgIGBjYXRlZ29yeSBcIiR7aWR9XCIgbm90IGZvdW5kLiBQbGVhc2UgcmVzZXQgdGhpcyBzZXR0aW5nIGFuZCBhZGQgeW91ciBjYXRlZ29yeShpZXMpIGFnYWluYFxuICAgICAgICApXG4gICAgICAgIGVycm9yID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzXG4gIH0sIFtdKVxuICBpZiAoZXJyb3IpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vIENoZWNrIHRoZSBkaXNjcGFnZV9iYWxsb29uX2NhdGVnb3J5IHNldHRpbmdcbiAgY29uc3QgdHJpZ2dlckNhdElkcyA9IGFwcEN0cmwuc2l0ZVNldHRpbmdzWydkaXNjcGFnZV9iYWxsb29uX2NhdGVnb3J5J11cbiAgZXJyb3IgPSBmYWxzZVxuICBjb25zdCB0cmlnZ2VyQ2F0cyA9XG4gICAgdHJpZ2dlckNhdElkcyAmJlxuICAgIHRyaWdnZXJDYXRJZHMuc3BsaXQoJ3wnKS5yZWR1Y2UoKHJlcywgaWRTdHIpID0+IHtcbiAgICAgIGNvbnN0IGlkID0gcGFyc2VJbnQoaWRTdHIpXG4gICAgICBjb25zdCBjYXQgPSBhcHBDdHJsLnNpdGUuY2F0ZWdvcmllcy5maW5kKGMgPT4gY1snaWQnXSA9PT0gaWQpXG4gICAgICBpZiAoY2F0KSB7XG4gICAgICAgIHJlcy5wdXNoKGNhdClcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE1heWJlIHRoZSBjYXRlZ29yeSBoYXMgbm90IGJlZW4gZm91bmQgYmVjYXVzZSB0aGUgdXNlciBpcyBub3QgYWxsb3dlZFxuICAgICAgICAvLyB0byBzZWUgaXQuIE9ubHkgd2l0aCBhZG1pbnMgYXJlIHdlIHN1cmUgdGhlcmUncyBhbiBlcnJvci4gRm9yIG90aGVyXG4gICAgICAgIC8vIHVzZXJzLCBpdCBtaWdodCBiZSBub3JtYWwuXG4gICAgICAgIGlmICh1c2VySXNBZG1pbikge1xuICAgICAgICAgIHNldHRpbmdFcnJvcihcbiAgICAgICAgICAgICdkaXNjcGFnZV9iYWxsb29uX2NhdGVnb3J5JyxcbiAgICAgICAgICAgIGBjYXRlZ29yeSBcIiR7aWR9XCIgbm90IGZvdW5kLiBQbGVhc2UgcmVzZXQgdGhpcyBzZXR0aW5nIGFuZCBhZGQgeW91ciBjYXRlZ29yeShpZXMpIGFnYWluYFxuICAgICAgICAgIClcbiAgICAgICAgICBlcnJvciA9IHRydWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc1xuICAgIH0sIFtdKVxuICBpZiAoZXJyb3IpIHtcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8qXG4gIC8vIERpc2FibGUgdGhlIGhlYWRlciB0aXRsZSByZXBsYWNlbWVudCB3aGVuIHNjcm9sbGluZyBkb3duIGEgdG9waWNcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2Rpc2NvdXJzZS9kaXNjb3Vyc2UvYmxvYi8xNjI0MTM4NjJjNzU2MTIwNzk2NGE2ODViOWFiMmZmMzkyY2I4NTgyL2FwcC9hc3NldHMvamF2YXNjcmlwdHMvZGlzY291cnNlL2NvbXBvbmVudHMvc2l0ZS1oZWFkZXIuanMuZXM2I0w0NVxuICBcbiAgTk8sIFRIRSBERUZBVUxUIEJFSEFWSU9SIElTIEJFVFRFUlxuICBQZW9wbGUgY2FuIHN0aWxsIGRvIGl0LCB0aG91Z2guIFNlZTpcbiAgaHR0cHM6Ly9tZXRhLmRpc2NvdXJzZS5vcmcvdC9pcy1pdC1wb3NzaWJsZS10by1kaXNhYmxlLXRvcGljLXRpdGxlLWluLWhlYWRlci83NTUwMi8yXG5cbiAgU2l0ZUhlYWRlckNvbXBvbmVudC5yZW9wZW4oe1xuICAgIFsnc2V0VG9waWMnXSh0b3BpYykge1xuICAgICAgLy8gRG8gbm90aGluZ1xuICAgIH1cbiAgfSlcbiAgKi9cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBXYWl0IHVudGlsIHRoZSBwYWdlIGlzIHJlbmRlcmVkLCB0aGVuIG1vZGlmeSBzb21lIHN0dWZmIGluIHRoZSBwYWdlXG4gIC8vIERPIFRISVMgRklSU1QsIFNPIEFOWU9ORSBUUklHR0VSSU5HIEFOIEVSUk9SIEZST00gSEVSRSBDQU4gRElTUExBWSBUSEVcbiAgLy8gRVJST1IgSU4gVEhFIElGUkFNRSAod2Ugd2FudCB0byBiZSB0aGUgZmlyc3QgYWZ0ZXJSZW5kZXIoKSwgc28gdGhhdFxuICAvLyBzdWJzZXF1ZW50IGFmdGVyUmVuZGVyKCkgY2FuIGZpbmQgYW4gZXhpc3RpbmcgaWZyYW1lKVxuICBhZnRlclJlbmRlcigpLnRoZW4oKCkgPT4ge1xuICAgIG9uQWZ0ZXJSZW5kZXIoY29udGFpbmVyLCBwYWdlQ2F0cywgdHJpZ2dlckNhdHMpXG4gIH0pXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gQWRkIHRoZSAncicgcXVlcnkgcGFyYW0uIFRoaXMgcXVlcnkgcGFyYW0gaXMgdXNlZCBvbmx5IHdpdGggcm91dGVzXG4gIC8vICd0YWcuc2hvdycgYW5kICd0b3BpYy4qJ1xuICAvLyBTdGFydGluZyBvbiB1cGRhdGVkIERpc2NvdXJzZSBkZXYgKDEwLzAxLzIwMTgpLFxuICAvLyB1c2UgY29udGFpbmVyLmxvb2t1cCgnY29udHJvbGxlcjphcHBsaWNhdGlvbicpIGluc3RlYWQgb2ZcbiAgLy9BcHBsaWNhdGlvbkNvbnRyb2xsZXIsIG9yIGl0IGRvZXNuJ3Qgd29ya1xuICBjb250YWluZXIubG9va3VwKCdjb250cm9sbGVyOmFwcGxpY2F0aW9uJykucmVvcGVuKHtcbiAgICBxdWVyeVBhcmFtczogeyBbJ3Nob3dSaWdodCddOiAncicgfSxcbiAgICBbJ3Nob3dSaWdodCddOiB0cnVlXG4gIH0pXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLypcbiAgY29udGFpbmVyLmxvb2t1cCgnY29udHJvbGxlcjp0b3BpYycpLnJlb3Blbih7XG4gICAgY2hhbmdlZDE6IEVtYmVyLm9ic2VydmVyKCdtb2RlbC5jYXRlZ29yeV9pZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGNvbnN0IG1vZGVsID0gdGhpcy5nZXQoJ21vZGVsJylcbiAgICAgIGNvbnNvbGUubG9nKCdtb2RlbDogJywgbW9kZWwpO1xuICAgICAgaWYgKG1vZGVsLmNhdGVnb3J5X2lkID09PSBwYWdlQ2F0ZWdvcnlJZCkge1xuICAgICAgICBjb250YWluZXIuZGNzTGF5b3V0LmZpbGxMZWZ0KG1vZGVsLmlkLnRvU3RyaW5nKCkpXG4gICAgICAgIGNvbnRhaW5lci5kY3NMYXlvdXQuc2V0TGF5b3V0KDApICBcbiAgICAgIH1cbiAgICB9KSxcbiAgICBjaGFuZ2VkMjogRW1iZXIub2JzZXJ2ZXIoJ21vZGVsLnRhZ3MnLCBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCd0YWdzIGhhdmUgY2hhbmdlZDogJywgdGhpcy5nZXQoJ21vZGVsLnRhZ3MnKSlcbiAgICB9KSwgICAgXG4gIH0pXG4gICovXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgbGV0IGxhc3RVcmwgPSAnJ1xuICAvL2xldCBzaHJpbmtDb21wb3NlciA9IHRydWVcbiAgd2l0aFBsdWdpbkFwaSgnMC44LjMwJywgYXBpID0+IHtcbiAgICAvLyBEaXNhYmxlIHRoZSBcInNob3cgdG9waWMgdGl0bGUgaW4gaGVhZGVyXCJcbiAgICAvLyBodHRwczovL21ldGEuZGlzY291cnNlLm9yZy90L2hpZGluZy10b3BpYy10aXRsZS1pbi1oZWFkZXIvMTE4MjY4XG4gICAgYXBpLm1vZGlmeUNsYXNzKCdjb21wb25lbnQ6ZGlzY291cnNlLXRvcGljJywge1xuICAgICAgWydzaG91bGRTaG93VG9waWNJbkhlYWRlciddKHRvcGljLCBvZmZzZXQpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICAgIC8vcmV0dXJuICQoJ2h0bWwnKS5oYXNDbGFzcygnZHBnLXdpZGUnKSA/IGZhbHNlIDogdGhpcy5fc3VwZXIodG9waWMsIG9mZnNldClcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLypcbiAgICAvLyBUTyBGSU5EIEVWRU5UUywgRE9XTkxPQUQgVEhFIERJU0NPVVJTRSBTT1VSQ0UgQ09ERSBBTkQgU0VBUkNIIEZPUjpcbiAgICAvLyAuYXBwRXZlbnRzLnRyaWdnZXIoXCJ0b3BpYzpcbiAgICBhcGkub25BcHBFdmVudCgndG9waWM6Y3JlYXRlZCcsIChjcmVhdGVkUG9zdCwgY29tcG9zZXIpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKCdjb21wb3NlcjogJywgY29tcG9zZXIpO1xuICAgICAgY29uc29sZS5sb2coJ2NyZWF0ZWRQb3N0OiAnLCBjcmVhdGVkUG9zdCk7XG4gICAgfSlcbiAgICBhcGkub25BcHBFdmVudCgnY29tcG9zZXI6aW5zZXJ0LXRleHQnLCAoKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZygnY29tcG9zZXI6ICcsIGFyZ3VtZW50cyk7XG4gICAgfSlcbiAgICBhcGkub25BcHBFdmVudCgnaGVhZGVyOnVwZGF0ZS10b3BpYycsIHRvcGljID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKCdoZWFkZXI6dXBkYXRlLXRvcGljOiAnLCB0b3BpYywgdG9waWMuY2F0ZWdvcnlfaWQsIHRvcGljLmNhdGVnb3J5ICYmIHRvcGljLmNhdGVnb3J5Lm5hbWUpXG4gICAgfSlcbiAgICAqL1xuXG4gICAgaWYgKHVzZXJJc0FkbWluKSB7XG4gICAgICBhcGkuZGVjb3JhdGVXaWRnZXQoJ2hhbWJ1cmdlci1tZW51OmZvb3RlckxpbmtzJywgKCkgPT4gKHtcbiAgICAgICAgWydocmVmJ106IHVuZGVmaW5lZCxcbiAgICAgICAgWydyYXdMYWJlbCddOiAnRGlzY1BhZ2UgT24vT2ZmJyxcbiAgICAgICAgWydjbGFzc05hbWUnXTogJ2RwZy1vbi1vZmYnXG4gICAgICB9KSlcbiAgICB9XG5cbiAgICAvLyBUSElTIElTIEEgSEFDSywgV0UgTkVFRCBUTyBETyBCRVRURVIgVEhBTiBUSElTXG4gICAgLy8gV2UgbmVlZCB0byBzdG9yZSBhIGRlY29yYXRvckhlbHBlciBzb21ld2hlcmUgYXQgdGhlIHZlcnkgYmVnaW5uaW5nIGluXG4gICAgLy8gb3JkZXIgdG8gZ2VuZXJhdGUgY29vayBwb3N0cyBpbiBzdGF0aWMgcGFnZXNcbiAgICBhcGkuZGVjb3JhdGVXaWRnZXQoJ2hlYWRlcjpiZWZvcmUnLCBoZWxwZXIgPT4ge1xuICAgICAgYWZ0ZXJSZW5kZXIoKS50aGVuKCgpID0+IHtcbiAgICAgICAgY29udGFpbmVyLmRjc0xheW91dC5kZWNvcmF0b3JIZWxwZXIgPSBoZWxwZXJcblxuICAgICAgICAvLyBGSVggRk9SIElTU1VFICMxOVxuICAgICAgICAvLyBUaGlzIGlzIGEgbmFzdHkgaGFjazogdGhlIENoZWNrbGlzdCBwbHVnaW4gbmVlZHMgdGhlIHBvc3QgbW9kZWwsIHNvXG4gICAgICAgIC8vIHdlIGNyZWF0ZSBhIGR1bW15IG9uZSBhbmQgd2UgZGlzYWJsZSBlZGl0aW5nLiBTZWU6XG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9kaXNjb3Vyc2UvZGlzY291cnNlLWNoZWNrbGlzdC9ibG9iL21hc3Rlci9hc3NldHMvamF2YXNjcmlwdHMvZGlzY291cnNlL2luaXRpYWxpemVycy9jaGVja2xpc3QuanMuZXM2I0wyM1xuICAgICAgICAvLyBJbiB0aGUgZnV0dXJlLCB3ZSdsbCBuZWVkIHRvIGZpbmQgYSBiZXR0ZXIgZml4LCBiZWNhdXNlIGFueSBwbHVnaW5cbiAgICAgICAgLy8gcmVseWluZyBvbiB0aGUgcG9zdCBtb2RlbCB3aWxsIGZhaWwuXG4gICAgICAgIGNvbnRhaW5lci5kY3NMYXlvdXQuZGVjb3JhdG9ySGVscGVyWyd3aWRnZXQnXVsnbW9kZWwnXSA9IHtcbiAgICAgICAgICBbJ2Nhbl9lZGl0J106IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgfSlcblxuICAgIC8vIFRoaXMgaXMgY2FsbGVkIGVhY2ggdGltZSBhIHRvcGljIGlzIGFib3V0IHRvIGJlIHJlbmRlcmVkLiBXZSBnZW5lcmF0ZVxuICAgIC8vIHN0YXRpYyBwYWdlIGNvbnRlbnQgaGVyZSwgbm90IGluIHRoZSAncGFnZTpjaGFuZ2VkJyBldmVudC4gVGhlIHJlYXNvbiBpc1xuICAgIC8vIHRoYXQgJ3BhZ2U6Y2hhbmdlZCcgZXZlbnQgaXMgbm90IGNhbGxlZCBhZnRlciBhIHRvcGljIGhhcyBiZWVuIGVkaXRlZFxuICAgIC8vIGFuZCByZWxvYWRzLlxuICAgIC8vIEFsc28sIGRvbid0IHVzZSBhcGkuZGVjb3JhdGVDb29rZWQoKSwgYmVjYXVzZSBpdCBpcyBjYWxsZWQgd2l0aCB0aGVcbiAgICAvLyBcImNvb2tlZCArIGRlY29yYXRlZFwiIHZlcnNpb24gb2YgdGhlIHBvc3QsIHdoaWNoIGlzIHVzZWxlc3MgYmVjYXVzZSB3ZVxuICAgIC8vIGNhbm5vdCBhZGQgZGVjb3JhdG9ycyBvbiBhbiBhbHJlYWR5ICh3cm9uZ2x5KSBkZWNvcmF0ZWQgcG9zdC5cbiAgICAvLyBodHRwczovL21ldGEuZGlzY291cnNlLm9yZy90L2hvdy1kby13ZS1maXJlLXNjcmlwdHMtYWZ0ZXItdG9waWMtaHRtbC1pcy1yZW5kZXJlZC1pbi1kb20vMTE0NzAxXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2Rpc2NvdXJzZS9kaXNjb3Vyc2UvYmxvYi82OTBkYjRmZDM2MWNjMDhmNTRlYTJhNGZhMjM1MmJmOTlkMTI4N2VmL2FwcC9hc3NldHMvamF2YXNjcmlwdHMvZGlzY291cnNlL3dpZGdldHMvcG9zdC1jb29rZWQuanMuZXM2I0w0NlxuICAgIGFwaS5kZWNvcmF0ZVdpZGdldCgncG9zdDphZnRlcicsIGhlbHBlciA9PiB7XG4gICAgICBjb25zdCBhdHRycyA9IGhlbHBlclsnYXR0cnMnXVxuXG4gICAgICAvLyBXZSBvbmx5IGNvbnNpZGVyIHRoZSBtYWluIHBvc3Qgb2YgYSB0b3BpY1xuICAgICAgaWYgKCFhdHRyc1snZmlyc3RQb3N0J10pIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIC8vIExvb2sgZm9yIHRvcGljcyB3aXRoIHRoZSAnUGFnZScgY2F0ZWdvcnlcbiAgICAgIGNvbnN0IGNhdE5hbWVzID0gJCgnI3RvcGljLXRpdGxlIC5jYXRlZ29yeS1uYW1lJylcbiAgICAgICAgLm1hcCgoaSwgZWwpID0+IGVsLmlubmVyVGV4dClcbiAgICAgICAgLmdldCgpXG4gICAgICBpZiAocGFnZUNhdHMuZmluZChjYXQgPT4gY2F0TmFtZXMuaW5jbHVkZXMoY2F0WyduYW1lJ10pKSkge1xuICAgICAgICAvLyBXYWl0IGZvciBjb250YWluZXIuZGNzTGF5b3V0IHRvIGJlIHJlYWR5XG4gICAgICAgIGFmdGVyUmVuZGVyKCkudGhlbigoKSA9PiB7XG4gICAgICAgICAgY29udGFpbmVyLmRjc0xheW91dC5maWxsTGVmdCh7XG4gICAgICAgICAgICBwYWdlSWQ6IGF0dHJzWyd0b3BpY0lkJ10udG9TdHJpbmcoKSxcbiAgICAgICAgICAgIHBvc3RJZDogYXR0cnNbJ2lkJ10sXG4gICAgICAgICAgICBsYXN0UmV2TnVtOiBhdHRyc1sndmVyc2lvbiddLFxuICAgICAgICAgICAgY29va2VkOiBhdHRyc1snY29va2VkJ10sXG4gICAgICAgICAgICB0aXRsZTogJCgnLmZhbmN5LXRpdGxlJykudGV4dCgpLnRyaW0oKVxuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGFpbmVyLmRjc0xheW91dC5zZXRMYXlvdXQoMClcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gUGFnZSBjaGFuZ2VkIGV2ZW50XG4gICAgLy8gU2VlIGFsc286IGh0dHBzOi8vZ2l0aHViLmNvbS9kaXNjb3Vyc2UvZGlzY291cnNlL2Jsb2IvbWFzdGVyL2FwcC9hc3NldHMvamF2YXNjcmlwdHMvZGlzY291cnNlL2luaXRpYWxpemVycy9wYWdlLXRyYWNraW5nLmpzLmVzNiNMMTVcbiAgICAvLyBUbyBnZXQgYSBsaXN0IG9mIGV2ZW50LCBzZWFyY2ggZm9yIFwiYXBwRXZlbnRzLnRyaWdnZXJcIiBpbiBHaXRIdWJcbiAgICBhcGkub25BcHBFdmVudChcbiAgICAgICdwYWdlOmNoYW5nZWQnLFxuICAgICAgKHtcbiAgICAgICAgWydjdXJyZW50Um91dGVOYW1lJ106IGN1cnJlbnRSb3V0ZU5hbWUsXG4gICAgICAgIFsndGl0bGUnXTogdGl0bGUsXG4gICAgICAgIFsndXJsJ106IHVybFxuICAgICAgfSkgPT4ge1xuICAgICAgICAvLyBZZXMsIHRoaXMgaGFwcGVucywgYXQgbGVhc3QgaW4gZGV2IG1vZGVcbiAgICAgICAgaWYgKHVybCA9PT0gbGFzdFVybCkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG5cbiAgICAgICAgLy8gU2VlIGlmIG9ubHkgcXVlcnkgcGFyYW1zIGhhdmUgY2hhbmdlZFxuICAgICAgICBjb25zdCBxdWVyeVBhcmFtc09ubHkgPSB1cmwuc3BsaXQoJz8nKVswXSA9PT0gbGFzdFVybC5zcGxpdCgnPycpWzBdXG4gICAgICAgIGxhc3RVcmwgPSB1cmxcblxuICAgICAgICAvLyBMb2cgcm91dGUgY2hhbmdlXG4gICAgICAgIC8qXG4gICAgICAgIHUubG9nKFxuICAgICAgICAgIGBEaXNjb3Vyc2UgcGFnZSBjaGFuZ2VkIHRvIFwiJHtjdXJyZW50Um91dGVOYW1lfVwiJHtcbiAgICAgICAgICAgIHF1ZXJ5UGFyYW1zT25seSA/ICcgKG9ubHkgcXVlcnlQYXJhbXMpJyA6ICcnXG4gICAgICAgICAgfWBcbiAgICAgICAgKVxuICAgICAgICAqL1xuXG4gICAgICAgIC8vIEhhbmRsZSB0aGUgdHJhbnNpdGlvblxuICAgICAgICBvbkRpZFRyYW5zaXRpb24oe1xuICAgICAgICAgIGNvbnRhaW5lcixcbiAgICAgICAgICByb3V0ZU5hbWU6IGN1cnJlbnRSb3V0ZU5hbWUsXG4gICAgICAgICAgcXVlcnlQYXJhbXNPbmx5LFxuICAgICAgICAgIHBhZ2VDYXRJZHMsXG4gICAgICAgICAgdHJpZ2dlckNhdHNcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBDb2xsYXBzZSB0aGUgY29tcG9zZXIsIGJlY2F1c2UgYWZ0ZXIgY2hhbmdpbmcgcm91dGUsIHRoZSBjdXJyZW50IGRyYWZ0XG4gICAgICAgIC8vIG1pZ2h0IG5vdCByZWxhdGUgdG8gdGhlIGN1cnJlbnQgYmFsbG9vbiBhbnltb3JlLiBTZWUgYmVsb3cgZm9yXG4gICAgICAgIC8vIHRoZSBwYXJ0IHdoZXJlIHdlIGNoYW5nZSB0aGUgcm91dGUgYmFjayB0byB0aGUgYXBwcm9wcmlhdGUgdGFnIHdoZW5cbiAgICAgICAgLy8gcmVvcGVuaW5nIHRoZSBjb21wb3Nlci5cbiAgICAgICAgLypcbiAgICAgICAgaWYgKHNocmlua0NvbXBvc2VyKSB7XG4gICAgICAgICAgY29udGFpbmVyLmxvb2t1cCgnY29udHJvbGxlcjpjb21wb3NlcicpLnNocmluaygpXG4gICAgICAgIH1cbiAgICAgICAgc2hyaW5rQ29tcG9zZXIgPSB0cnVlXG4gICAgICAgICovXG4gICAgICB9XG4gICAgKVxuICB9KVxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIFRvcGljTmF2aWdhdGlvbkNvbXBvbmVudC5yZW9wZW4oe1xuICAgIC8vIFRoZSB0b3BpYy1uYXZpZ2F0aW9uIGNvbXBvbmVudCBpcyByZXNwb25zaWJsZSBmb3IgZGlzcGxheWluZyBlaXRoZXIgYVxuICAgIC8vIHZlcnRpY2FsIHRpbWVsaW5lIChvbiBsYXJnZSBzY3JlZW5zKSBvciBhIHNtYWxsIGhvcml6b250YWwgZ2F1Z2UgKG9uXG4gICAgLy8gc21hbGwgc2NyZWVucykuU2VlIHRoaXMgY29kZTpcbiAgICAvLyBodHRwczovL2dpdGh1Yi5jb20vZGlzY291cnNlL2Rpc2NvdXJzZS9ibG9iL21hc3Rlci9hcHAvYXNzZXRzL2phdmFzY3JpcHRzL2Rpc2NvdXJzZS9hcHAvY29tcG9uZW50cy90b3BpYy1uYXZpZ2F0aW9uLmpzI0wzOFxuICAgIC8vIFRoaXMgY29kZSBmYWlscyBiZWNhdXNlIGl0IHBlcmZvcm1zIGEgY29tcHV0YXRpb24gYmFzZWQgb24gdGhlIHdpbmRvd1xuICAgIC8vIHdpZHRoIGluc3RlYWQgb2YgI21haW4tb3V0bGV0IHdpZHRoLiBXZSBuZWVkIHRvIGZpeCB0aGlzLCBvdGhlcndpc2UgdGhlXG4gICAgLy8gdmVydGljYWwgdGltZWxpbmUgaXMgZGlzcGxheWVkIG91dCBvZiB0aGUgd2luZG93IGFyZWEgb24gdGhlIHJpZ2h0LlxuICAgIC8vIEluIHRoZSBwYXN0LCB3ZSB1c2VkIHRvIGRvIHRoZSBzYW1lIGluIERjc0xheW91dC5qcyBieSBmb3JjaW5nIHRoZVxuICAgIC8vIG1vYmlsZSB2aWV3IGxpa2UgdGhpczpcbiAgICAvLyB0aGlzLmFwcEN0cmwuc2l0ZS5zZXQoJ21vYmlsZVZpZXcnLCB0aGlzLnNhdmVNb2JpbGVWaWV3IHx8IG5ld0xheW91dCA9PT0gMiB8fCBuZXdMYXlvdXQgPT09IDMpXG4gICAgLy8gSVQgRE9FU04nVCBXT1JLIFdFTEwhIEZvcmNpbmcgbW9iaWxlVmlldz10cnVlIGhhcyBzaWRlIGVmZmVjdHMsIHN1Y2ggYXNcbiAgICAvLyBkaXNhYmxpbmcgdGhlIGZ1bGxzY3JlZW4gYnV0dG9uLlxuICAgIFsnX3BlcmZvcm1DaGVja1NpemUnXSgpIHtcbiAgICAgIHRoaXMuX3N1cGVyKClcbiAgICAgIC8vIFRISVMgRE9FU04nVCBXT1JLIEFUIExPQUQgVElNRSwgYmVjYXVzZSAkKCcjbWFpbi1vdXRsZXQnKS53aWR0aCgpIGlzIFxuICAgICAgLy8gbm90IHNldCB5ZXQuIFNlZSBiZWxvdyBmb3IgYSBmaXggdG8gdGhpcyBpc3N1ZS5cbiAgICAgIGlmICgkKCcjbWFpbi1vdXRsZXQnKS53aWR0aCgpIDw9IDEwMDUgLyogOTI0ICovKSB7XG4gICAgICAgIHRoaXMuaW5mb1snc2V0UHJvcGVydGllcyddKHsgWydyZW5kZXJUaW1lbGluZSddOiBmYWxzZSB9KVxuICAgICAgfVxuICAgIH0sXG5cbiAgICBbJ2RpZEluc2VydEVsZW1lbnQnXSgpIHtcbiAgICAgIHRoaXMuX3N1cGVyKC4uLmFyZ3VtZW50cylcblxuICAgICAgLy8gQXQgbG9hZCB0aW1lLCB3ZSBuZWVkIHRvIHdhaXQgZm9yIHRoZSBEaXNjUGFnZSBsYXlvdXQgdG8gYmUgYXBwbGllZFxuICAgICAgLy8gYW5kIGNoZWNrIHRoZSBzaXplIGFnYWluLCBvdGhlcndpc2UgdGhlIGluaXRpYWwgc2l6ZSBjaGVjayBpcyB3cm9uZ1xuICAgICAgdGhpcy5vYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKG11dGF0aW9ucyA9PiB7XG4gICAgICAgIG11dGF0aW9ucy5mb3JFYWNoKG11dGF0aW9uID0+IHtcbiAgICAgICAgICBpZiAobXV0YXRpb24uYXR0cmlidXRlTmFtZSA9PT0gJ2NsYXNzJykge1xuICAgICAgICAgICAgaWYgKG11dGF0aW9uLnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2RwZy10b3BpYycpKSB7XG4gICAgICAgICAgICAgIC8vIFdlIHdvdWxkIGxvdmUgdG8gY2FsbCAgX2NoZWNrU2l6ZSgpIGhlcmUgaW5zdGVhZCBvZiBfcGVyZm9ybUNoZWNrU2l6ZSgpLCBhcyBpdCBpcyBkZWJvdW5jZWQuIFNlZTpcbiAgICAgICAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2Rpc2NvdXJzZS9kaXNjb3Vyc2UvYmxvYi9tYWluL2FwcC9hc3NldHMvamF2YXNjcmlwdHMvZGlzY291cnNlL2FwcC9jb21wb25lbnRzL3RvcGljLW5hdmlnYXRpb24uanMjTDY3XG4gICAgICAgICAgICAgIC8vIEJ1dCBpZiB3ZSBkbyBpdCwgYXQgaW5pdCB0aW1lLCB0aGUgb3JpZ2luYWwgX3BlcmZvcm1DaGVja1NpemUoKSBcbiAgICAgICAgICAgICAgLy8gaXMgY2FsbGVkIGluc3RlYWQgb2Ygb3VyIG1vZGlmaWVkIG9uZS5cbiAgICAgICAgICAgICAgdGhpc1snX3BlcmZvcm1DaGVja1NpemUnXSgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICAgIHRoaXMub2JzZXJ2ZXIub2JzZXJ2ZShkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIHsgYXR0cmlidXRlczogdHJ1ZSB9KVxuICAgIH0sXG5cbiAgICBbJ3dpbGxEZXN0cm95RWxlbWVudCddKCkge1xuICAgICAgdGhpcy5vYnNlcnZlci5kaXNjb25uZWN0KClcbiAgICAgIHRoaXMuX3N1cGVyKC4uLmFyZ3VtZW50cylcbiAgICB9XG4gIH0pXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLypcbiAgVG9waWNQcm9ncmVzc0NvbXBvbmVudC5yZW9wZW4oe1xuICAgIFsnX3NldHVwT2JzZXJ2ZXInXSgpIHtcbiAgICAgIC8vdGhpcy5fc3VwZXIoKVxuICAgICAgY29uc29sZS5sb2coJ2dmZXl1Z2Z6ZXl1Z2V6Znl1Jyk7XG5cbiAgICAgIGNvbnN0IGJvdHRvbUludGVyc2VjdGlvbk1hcmdpbiA9XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmVwbHktY29udHJvbFwiKT8uY2xpZW50SGVpZ2h0IHx8IDUwO1xuXG4gICAgICByZXR1cm4gbmV3IEludGVyc2VjdGlvbk9ic2VydmVyKHRoaXMuX2ludGVyc2VjdGlvbkhhbmRsZXIsIHtcbiAgICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgICByb290TWFyZ2luOiBgMHB4IDBweCAtJHtib3R0b21JbnRlcnNlY3Rpb25NYXJnaW59cHggNTAlYFxuICAgICAgICAvL3Jvb3Q6IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjbWFpbi1vdXRsZXRcIilcbiAgICAgIH0pOyAgICAgICAgICAgIFxuICAgIH1cbiAgfSlcbiAgKi9cblxuICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvKlxuICBDb21wb3NlckNvbnRyb2xsZXIucmVvcGVuKHtcbiAgICBjb21wb3NlU3RhdGVDaGFuZ2VkOiBFbWJlci5vYnNlcnZlcignbW9kZWwuY29tcG9zZVN0YXRlJywgZnVuY3Rpb24oKSB7XG4gICAgICAvLyBHZXQgdGhlIGNvbXBvc2VyIHN0YXRlXG4gICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0KCdtb2RlbC5jb21wb3NlU3RhdGUnKVxuICAgICAgXG4gICAgICAvLyBXZSBhcmUgZ29pbmcgdG8gZG8gc29tZXRoaW5nIHdoZW4gdGhlIGNvbXBvc2VyIG9wZW5zXG4gICAgICBpZiAoc3RhdGUgPT09IENvbXBvc2VyLk9QRU4pIHtcbiAgICAgICAgLy8gQ2FzZXMgdGhhdCBhcmUgaW50ZXJlc3RpbmcgZm9yIHVzOlxuICAgICAgICAvLyAtIFdoZW4gdGhlIGNvbXBvc2VyIG9wZW5zIGFzIFwiTmV3IFRvcGljXCIgb24gYSBEaXNjUGFnZSB0YWcsIGluIHdoaWNoXG4gICAgICAgIC8vIGNhc2UgbW9kZWwudGFncyB3aWxsIGNvbnRhaW4gYSBkcGcgdGFnc1xuICAgICAgICAvLyAtIFdoZW4gdGhlIGNvbXBvc2VyIG9wZW5zIGFzIFwiTmV3IFJlcGx5XCIgb24gYSBEaXNjUGFnZSB0b3BpYywgaW4gd2hpY2hcbiAgICAgICAgLy8gY2FzZSBtb2RlbC50b3BpYy50YWdzIHdpbGwgY29udGFpbiBhIGRwZyB0YWdzXG4gICAgICAgIGNvbnN0IHRhZ3MgPSB0aGlzLmdldCgnbW9kZWwudGFncycpIHx8IHRoaXMuZ2V0KCdtb2RlbC50b3BpYy50YWdzJylcbiAgICAgICAgbGV0IHBhcnNlZFxuICAgICAgICBjb25zdCBkcGdUYWcgPVxuICAgICAgICAgIHRhZ3MgJiZcbiAgICAgICAgICB0YWdzLmZpbmQodCA9PiB7XG4gICAgICAgICAgICBwYXJzZWQgPSBEcGdUYWcucGFyc2UodClcbiAgICAgICAgICAgIHJldHVybiAhIXBhcnNlZFxuICAgICAgICAgIH0pXG4gICAgICAgIGlmICghZHBnVGFnKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBXaGVuIG9wZW5pbmcgKHNsaWRpbmcgdXApIHRoZSBjb21wb3NlciB3aXRoIGEgZHBnVGFnLCByZWRpcmVjdCB0byB0aGVcbiAgICAgICAgLy8gYXBwcm9wcmlhdGUgcm91dGVcbiAgICAgICAgY29uc3QgdG9waWMgPSB0aGlzLmdldCgnbW9kZWwudG9waWMnKVxuICAgICAgICBjb25zdCBwYXRoID0gdG9waWNcbiAgICAgICAgICA/IGAvdC8ke3RvcGljLmdldCgnc2x1ZycpfS8ke3RvcGljLmdldCgnaWQnKX0/cj10cnVlYFxuICAgICAgICAgIDogYC90YWcvJHtkcGdUYWd9P3I9dHJ1ZWBcbiAgICAgICAgc2hyaW5rQ29tcG9zZXIgPSBmYWxzZVxuICAgICAgICBjb250YWluZXIubG9va3VwKCdyb3V0ZXI6bWFpbicpLnRyYW5zaXRpb25UbyhwYXRoKVxuXG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH0pXG4gIH0pXG4gICovXG5cbiAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgQXBwbGljYXRpb25Sb3V0ZS5yZW9wZW4oe1xuICAgIC8vIFdhdGNoIHRvcGljIHN0YXRlc1xuICAgIC8vIG1lc3NhZ2VDb3VudCBpcyB0aGUgbWVzc2FnZSBpbmRleCB0aGF0IGNoYW5nZXMgd2hlbmV2ZXIgYSBuZXcgc3RhdGVcbiAgICAvLyBtZXNzYWdlIGlzIHNlbnQuIEl0IGRvZXNuJ3QgbWVhbiBzb21ldGhpbmcgYXMgY2hhbmdlZCwgdGhvdWdoOiBhIG5ld1xuICAgIC8vIG1lc3NhZ2UgaXMgYWx3YXlzIHNlbnQgd2hlbiB0aGVyZSdzIGEgcm91dGUgY2hhbmdlLlxuICAgIHRvcGljU3RhdGVDaGFuZ2VkOiBFbWJlci5vYnNlcnZlcihcbiAgICAgICd0b3BpY1RyYWNraW5nU3RhdGUubWVzc2FnZUNvdW50JyxcbiAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAvKlxuICAgICAgICBjb25zdCBhcHBDdHJsID0gdGhpcy5jb250cm9sbGVyRm9yKCdhcHBsaWNhdGlvbicpXG4gICAgICAgIGNvbnN0IHRvcGljU3RhdGVzID0gYXBwQ3RybFsndG9waWNUcmFja2luZ1N0YXRlJ11bJ3N0YXRlcyddXG4gICAgICAgIGNvbnNvbGUubG9nKCd0b3BpY1N0YXRlczogJywgYXBwQ3RybFsndG9waWNUcmFja2luZ1N0YXRlJ10pO1xuICAgICAgICBjb25zdCByZXMgPSBzaW1wbGlmeVRvcGljU3RhdGVzKHRvcGljU3RhdGVzKVxuICAgICAgICBpZiAocmVzLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCd0b3BpY1N0YXRlQ2hhbmdlZDogJywgcmVzKVxuICAgICAgICB9XG4gICAgICAgICovXG4gICAgICB9XG4gICAgKVxuICB9KVxuXG4gIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxufVxuXG5jb25zdCBhZnRlclJlbmRlciA9IHJlcyA9PlxuICBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAvLyBAdHMtaWdub3JlXG4gICAgRW1iZXIucnVuLnNjaGVkdWxlKCdhZnRlclJlbmRlcicsIG51bGwsICgpID0+IHJlc29sdmUocmVzKSlcbiAgfSlcblxuZnVuY3Rpb24gc2V0dGluZ0Vycm9yKHNldHRpbmcsIG1zZykge1xuICB1LmxvZ0Vycm9yKFxuICAgIGBJbnZhbGlkIERpc2NvdXJzZSBzZXR0aW5nIFwiJHtzZXR0aW5nLnJlcGxhY2UoL18vZywgJyAnKX1cIjogJHttc2d9YFxuICApXG59XG4iXSwibmFtZXMiOlsiZ2V0IiwiYWZ0ZXJSZW5kZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTtBQUNBO0FBQ08sTUFBTSxDQUFDLEdBQUcsR0FBRTtBQUNuQjtBQUNBO0FBQ0E7QUFDQSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLEtBQUs7QUFDckIsRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFLFlBQVksRUFBRSxHQUFHLElBQUksRUFBQztBQUNoRCxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLEVBQUM7QUFDdEIsRUFBQztBQUNEO0FBQ0EsQ0FBQyxDQUFDLFFBQVEsR0FBRyxDQUFDLEdBQUcsSUFBSSxLQUFLO0FBQzFCLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksRUFBQztBQUNyRCxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLEVBQUM7QUFDdEIsRUFBQztBQUNEO0FBQ0EsQ0FBQyxDQUFDLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxLQUFLO0FBQzVCLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLGNBQWMsRUFBRSxHQUFHLElBQUksRUFBQztBQUMxRCxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLEVBQUM7QUFDdEIsRUFBQztBQUNEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsQ0FBQyxDQUFDLGFBQWEsR0FBRyxjQUFjLEtBQUssQ0FBQztBQUN0QyxFQUFFLFdBQVcsQ0FBQyxHQUFHLEVBQUU7QUFDbkIsSUFBSSxLQUFLLENBQUMsR0FBRyxFQUFDO0FBQ2QsSUFBSSxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQyxjQUFhO0FBQ3RDLElBQUksSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsYUFBYSxDQUFDLFVBQVM7QUFDOUMsSUFBSSxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUc7QUFDdEIsSUFBSSxJQUFJLENBQUMsSUFBSSxHQUFHLGdCQUFlO0FBQy9CLEdBQUc7QUFDSCxFQUFDO0FBQ0Q7QUFDQSxDQUFDLENBQUMsS0FBSyxHQUFHLEdBQUcsSUFBSTtBQUNqQixFQUFFLE1BQU0sSUFBSSxDQUFDLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQztBQUNoQyxFQUFDO0FBQ0Q7QUFDQSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsSUFBSSxFQUFFLEdBQUcsS0FBSyxJQUFJLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUM7QUFDL0MsQ0FBQyxDQUFDLFVBQVUsR0FBRyxDQUFDLElBQUksRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUM7QUFDbkQ7QUFDQTtBQUNBLENBQUMsQ0FBQyxHQUFHLEdBQUc7QUFDUixFQUFFLE1BQU0sRUFBRSxDQUFDLElBQUksRUFBRSxHQUFHO0FBQ3BCLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsR0FBRyxLQUFLLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFDakUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUc7QUFDWixFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsVUFBVTtBQUMxQixFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsUUFBUTtBQUN0QixFQUFDO0FBQ0Q7QUFDQTtBQUNBO0FBQ0EsQ0FBQyxDQUFDLFFBQVEsR0FBRyxNQUFNO0FBQ25CLEVBQUUsSUFBSTtBQUNOLElBQUksT0FBTyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxHQUFHO0FBQ3JDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRTtBQUNkLElBQUksT0FBTyxJQUFJO0FBQ2YsR0FBRztBQUNILEVBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDLENBQUMsU0FBUyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsU0FBUztBQUM5QyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFDO0FBQ3pFO0FBQ0EsQ0FBQyxDQUFDLEtBQUssR0FBRztBQUNWO0FBQ0E7QUFDQTtBQUNBLEVBQUUsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFF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
