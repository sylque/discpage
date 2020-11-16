// https://meta.discourse.org/t/developers-guide-to-markdown-extensions/66023
// https://github.com/discourse/discourse-spoiler-alert/blob/master/assets/javascripts/lib/discourse-markdown/spoiler-alert.js.es6#L43
// https://github.com/tohaitrieu/discourse-bbcode-hide/blob/master/assets/javascripts/lib/discourse-markdown/bbcode-hide.js.es6
// https://github.com/discourse/discourse/blob/master/app/assets/javascripts/pretty-text/engines/discourse-markdown/bbcode-inline.js.es6
// https://github.com/discourse/discourse-math/blob/master/assets/javascripts/lib/discourse-markdown/discourse-math.js.es6
// https://github.com/discourse/discourse-bbcode/blob/1397824f8afc71d52ed284597aab526a4d567cea/assets/javascripts/lib/discourse-markdown/bbcode.js.es6#L227

// CANNOT WORK SERVER-SIDE !!!
// See https://meta.discourse.org/t/cannot-import-discourse-libs-in-markdown-extensions/137077
//import { iconHTML } from 'discourse-common/lib/icon-library'

/*
How to rebake all posts:

cd /var/discourse
./launcher enter app
rake posts:rebake
*/


export function setup(helper) {
  //console.log('setup: ', helper.getOptions().discourse.currentUser);

  //----------------------------------------------------------------------------

  if (!helper.markdownIt) {
    return
  }

  //----------------------------------------------------------------------------

  helper.registerOptions((opts, siteSettings) => {
    opts.features['discpage'] = !!siteSettings.discpage_enabled
  })

  //----------------------------------------------------------------------------

  helper.whiteList(['span.dpg-balloon-text'])

  helper.registerPlugin(md => {
    md.inline.bbcode.ruler.push('dpgb', {
      tag: 'dpgb',
      wrap: function (startToken, endToken, tagInfo) {
        startToken.tag = endToken.tag = 'span'
        startToken.content = endToken.content = ''
        startToken.type = "span_open";
        endToken.type = "span_close";    
        startToken.nesting = 1;
        endToken.nesting = -1;    
        startToken.attrs = [['class', 'dpg-balloon-text']].concat(
          Object.keys(tagInfo.attrs).map(key => [
            `data-dpg-${key}`,
            tagInfo.attrs[key]
          ])
        )
      }
      /*
      replace: function(state, tagInfo, content) {        
        //const contentTokens = state.tokens.slice(1, -1)

        let token = state.push('span_open', 'span', 1)
        token.attrs = [['class', 'dpg-balloon-parent']].concat(
          Object.keys(tagInfo.attrs).map(key => [
            `data-dpg-${key}`,
            tagInfo.attrs[key]
          ])
        )

        token = state.push('html_raw', '', 0)
        token.content = `
          <span class="dpg-balloon-text">${content.trim()}</span>
          <span class="dpg-icons" title="Click to discuss this part">
            <span class="dpg-balloon">${iconHTML('comment')}</span>
            <span class="dpg-badge">99</span>
          </span>
        `
        // Prevent inserting blank characters that could have a background color
        token.content = token.content.replace(/(\r\n|\n|\r|  )/g, '')

        state.push('span_close', 'span', -1)
        return true
      }
      */
    })
  })

  //----------------------------------------------------------------------------
}
/*
// https://stackoverflow.com/questions/6234773/can-i-escape-html-special-chars-in-javascript
const escapeHtml = unsafe =>
  unsafe &&
  unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const iconHTML = iconName => `
  <svg class="fa d-icon d-icon-${iconName} svg-icon svg-string" xmlns="http://www.w3.org/2000/svg">
    <use xlink:href="#${iconName}"></use>
  </svg>
`
*/


/*
// <span class="dpg-balloon-text">${content.trim()}</span>
token = state.push('span_open', 'span', 1)
token.attrs = [['class', 'dpg-balloon-text']]
token = state.push('text', '', 0)
token.content = content
state.push('span_close', 'span', -1)

// <span class="dpg-icons" title="Click to discuss this part">
//   <span class="dpg-balloon">${iconHTML('comment')}</span>
//   <span class="dpg-badge">99</span>
// </span>
token = state.push('html_raw', '', 0)
token.content = `
  <span class="dpg-icons" title="Click to discuss this part">
    <span class="dpg-balloon">${iconHTML('comment')}</span>
    <span class="dpg-badge">99</span>
  </span>
`
*/

/*
token = state.push('span_open', 'span', 1)
token.attrs = [
  ['class', 'dpg-icons'],
  ['title', 'Click to discuss this part']
]
state.push('span_close', 'span', -1)
*/
