//------------------------------------------------------------------------------

//import discourseComputed from "discourse-common/utils/decorators";
//import Topic from 'discourse/models/topic'

import { init } from '../lib/lib'

//------------------------------------------------------------------------------

export default {
  name: 'discpage',
  initialize(container, app) {

    /*
    DOESN'T WORK
    // Disable going to last read position in topics. See:
    // https://github.com/discourse/discourse/blob/main/app/assets/javascripts/discourse/app/models/topic.js#L258
    Topic.reopen({
      @discourseComputed("last_read_post_number", "highest_post_number", "url")
      lastUnreadUrl(lastReadPostNumber, highestPostNumber) {
        console.log('diuygfeziufgzeuifzegiu');
        const res = this._super(...arguments);
        return this.urlForPostNumber(1);
      }
    })    
    */

    init(container, app)
  }
}
