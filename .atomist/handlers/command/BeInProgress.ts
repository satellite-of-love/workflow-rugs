import { HandleCommand, HandlerContext, MappedParameters, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';

/**
 * A mark an issue as in-progress.
 */
@CommandHandler("BeInProgress", "mark an issue as in-progress")
@Tags("issue", "satellite-of-love", "workflow")
@Intent("start work")
export class BeInProgress implements HandleCommand {

    @MappedParameter(MappedParameters.GITHUB_REPOSITORY)
    repo: string;

    @MappedParameter(MappedParameters.SLACK_USER)
    user: string;

    @Parameter({
        displayName: "Issue Number",
        description: "issue number",
        pattern: Pattern.any,
        validInput: "an issue number"
    })
    issue: string;

    handle(command: HandlerContext): Plan {
        let message = new ResponseMessage(`Starting work by <@${this.user}> on ${this.repo}#${this.issue}`);
        return Plan.ofMessage(message);
    }
}

export const beInProgress = new BeInProgress();
