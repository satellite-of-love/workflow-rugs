import { HandleCommand, HandlerContext, MappedParameters, ResponseMessage, CommandPlan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/GitHubId';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';

/**
 * A mark an issue as in-progress.
 */
@CommandHandler("BeInProgress", "mark an issue as in-progress")
@Tags("issue", "satellite-of-love", "workflow")
@Intent("start work")
export class BeInProgress implements HandleCommand {

    @MappedParameter(MappedParameters.GITHUB_REPO_OWNER)
    owner: string

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

    handle(command: HandlerContext): CommandPlan {
        let plan = new CommandPlan();

        let ghId = githubLoginFromSlackUser(command, this.user);
        let login: string;
        if (success(ghId)) {
            plan.add(new ResponseMessage(`Starting work by <@${this.user}> (id is ${this.user}, github login ${ghId.login}) on ${this.repo}#${this.issue}`));
            login = ghId.login;
        } else {
            plan.add(new ResponseMessage(`Unable to determine github login for <@${this.user}>: ${ghId.error}`));
            return plan;
        }

        plan.add(addLabelToIssue(this.owner, this.repo, this.issue, "in-progress"))

        return plan;
    }
}

function addLabelToIssue(owner: string, repo: string, issue: string, labelName: string) {
     const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}/labels`;

        let instr = PlanUtils.execute("http",
            {
                url: url,
                method: "post",
                config: {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `token #{github://user_token?scopes=repo}`,
                    },
                    body: JSON.stringify([labelName])
                }
            });
        instr.onSuccess = new ResponseMessage(`Added ${labelName} label`)
        CommonHandlers.handleErrors(instr, { msg: "The add-label request to GitHub failed" });
        return instr;
        
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

export const errors = new CommonHandlers.GenericErrorHandler();
export const beInProgress = new BeInProgress();
