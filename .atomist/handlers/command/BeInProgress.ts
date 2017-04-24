import { HandleCommand, HandlerContext, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';

/**
 * A mark an issue as in-progress.
 */
@CommandHandler("BeInProgress", "mark an issue as in-progress")
@Tags("documentation")
@Intent("start work")
export class BeInProgress implements HandleCommand {

    @Parameter({
        displayName: "Some Input",
        description: "example of how to specify a parameter using decorators",
        pattern: Pattern.any,
        validInput: "a description of the valid input",
        minLength: 1,
        maxLength: 100,
        required: false
    })
    inputParameter: string = "default value";

    handle(command: HandlerContext): Plan {
        let message = new ResponseMessage(`Successfully ran BeInProgress: ${this.inputParameter}`);
        return Plan.ofMessage(message);
    }
}

export const beInProgress = new BeInProgress();
