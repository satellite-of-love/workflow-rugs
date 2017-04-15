import { HandleCommand, HandlerContext, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';

/**
 * A sample Rug TypeScript command handler.
 */
@CommandHandler("WhatShouldIDo", "list stuff that is my job to fix")
@Tags("workflow", "satellite-of-love")
@Intent("I'm bored")
export class WhatShouldIDo implements HandleCommand {

    @MappedParameter("atomist://slack/user")
    user: string;

    handle(command: HandlerContext): Plan {
        let pxe = command.pathExpressionEngine;


        let message = new ResponseMessage(`Go to the beach, <@${this.user}>.`);
        return Plan.ofMessage(message);
    }
}

export const whatShouldIDo = new WhatShouldIDo();
