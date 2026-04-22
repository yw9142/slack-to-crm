import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';

import {
  SLACK_AGENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIERS,
  SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS,
} from 'src/constants/universal-identifiers';

export default defineNavigationMenuItem({
  universalIdentifier:
    SLACK_AGENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIERS.requests,
  type: NavigationMenuItemType.VIEW,
  name: 'Slack Agent Requests',
  icon: 'IconBrandSlack',
  position: 70,
  viewUniversalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.requests,
});
