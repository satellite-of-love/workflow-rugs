import { HandleCommand, HandlerContext, MappedParameters, ResponseMessage, Plan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/GitHubId';

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
        let plan = new Plan();

        let ghId = githubLoginFromSlackUser(command, this.user);
        let login: string;
        if (success(ghId)) {
            plan.add(new ResponseMessage(`Starting work by <@${this.user}> (id is ${this.user}, github login ${ghId.login}) on ${this.repo}#${this.issue}`));
            login = ghId.login;
        } else {
            plan.add(new ResponseMessage(`Unable to determine github login for <@${this.user}>: ${ghId.error}`));
            return plan;
        }
        return plan;
    }
}

function success(pet: GitHubId | Sadness): pet is GitHubId {
    return (<GitHubId>pet).login !== undefined;
}

interface Sadness {
    error: string
}

function githubLoginFromSlackUser(context: HandlerContext, slackUser: string): GitHubId | Sadness {
    let userMatch = context.pathExpressionEngine.evaluate<ChatTeam, GitHubId>(context.contextRoot as ChatTeam,
        `/members::ChatId()[@id='${slackUser}']/person::Person()/gitHubId::GitHubId()`);

    if (userMatch == null) {
        return { error: "null result" }
    }
    let matches = userMatch.matches();
    if (matches.length == 0) {
        return { error: "empty result" }
    }
    if (matches.length == 1) {
        // happy path
        return matches[0];
    }
    if (matches.length > 1) {
        console.log(`Warning: got #{userMatch.matches().length} github logins`)
        let firstLogin = matches[0].login;
        if (matches.every(n => n.login === firstLogin)) {
            console.log("It's OK, they're all the same")
            return matches[0];
        }
        return { error: "Multiple different github logins returned: " + matches.map(f => f.login).join(",") }
    }
}

export const beInProgress = new BeInProgress();
