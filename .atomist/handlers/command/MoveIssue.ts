import { HandleCommand, HandlerContext, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';

/**
 * A move an issue from one repo to another.
 */
@CommandHandler("MoveIssue", "move an issue from one repo to another")
@Tags("documentation")
@Intent("move issue")
export class MoveIssue implements HandleCommand {

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
        let message = new ResponseMessage(`Successfully ran MoveIssue: ${this.inputParameter}`);
        return Plan.ofMessage(message);
    }
}

export const moveIssue = new MoveIssue();
