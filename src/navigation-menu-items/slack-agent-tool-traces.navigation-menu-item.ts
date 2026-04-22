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
    SLACK_AGENT_NAVIGATION_MENU_ITEM_UNIVERSAL_IDENTIFIERS.toolTraces,
  type: NavigationMenuItemType.VIEW,
  name: 'Slack Agent Tool Traces',
  icon: 'IconTool',
  position: 71,
  viewUniversalIdentifier: SLACK_AGENT_VIEW_UNIVERSAL_IDENTIFIERS.toolTraces,
});
