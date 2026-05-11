import { Keyboard } from 'grammy';
import { MENU } from '../constants';

export function mainMenuKeyboard(): Keyboard {
  return new Keyboard()
    .text(MENU.MY_SERVICES).text(MENU.BUY).row()
    .text(MENU.WALLET).text(MENU.INVITE).row()
    .text(MENU.SUPPORT).text(MENU.APPS)
    .resized();
}
