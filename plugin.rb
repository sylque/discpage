# name: discpage
# about: Create static pages and attach discussions to them
# version: 1.0.58
# authors: Sylvain Quendez
# url: https://github.com/sylque/discpage

# Load styles
register_asset "stylesheets/discpage.scss"
register_asset "stylesheets/discpage-mobile.scss", :mobile

# Load icons
register_svg_icon "comment" if respond_to?(:register_svg_icon)
register_svg_icon "history" if respond_to?(:register_svg_icon)

# Register admin settings
enabled_site_setting :discpage_enabled

# Register the template to restore the create topic button
# NOT NEEDED ANYMORE: "Any hbs files under `assets/javascripts` will be
# automatically compiled and included."
#register_asset "javascripts/discourse/templates/components/create-topic-button.hbs"

# In Discourse, editing the *last* post of a topic bumps the topic. A DiscPage
# static page is almost always the only post of a topic (because further posts
# are never displayed). It means any minor edit in the static page will bump it.
# Hence this option to prevent static pages from ever getting bumped.
# https://meta.discourse.org/t/discourse-no-bump-prevent-users-from-bumping-topics/78186
# https://github.com/discourse/discourse-no-bump/blob/master/plugin.rb#L34
after_initialize do
  add_to_class :post_revisor, :bypass_bump? do
    return false unless SiteSetting.discpage_never_bump_pages
    SiteSetting.discpage_page_categories.include?(@topic.category_id.to_s)
  end
end