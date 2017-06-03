import { HandleCommand, HandlerContext, MappedParameters, ResponseMessage, CommandPlan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent, Secrets } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/stub/GitHubId';
import { Person } from '@atomist/cortex/stub/Person';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';

/**
 * A mark an issue as in-progress.
 */
@CommandHandler("CompleteWork", "close an issue and remove the in-progress marker")
@Tags("issue", "satellite-of-love", "workflow")
@Intent("complete work")
@Secrets("github://user_token?scopes=repo")
export class BeComplete implements HandleCommand {

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

        plan.add(new ResponseMessage(`Stopping work on ${this.repo}#${this.issue}`));

        plan.add(removeLabelFromIssue(this.owner, this.repo, this.issue, "in-progress"))
        plan.add(closeIssue(this.owner, this.repo, this.issue))
        // TODO: remove this label from all other issues assigned to me

        return plan;
    }
}

function removeLabelFromIssue(owner: string, repo: string, issue: string, labelName: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}/labels/${labelName}`;

    let instr = PlanUtils.execute("http",
        {
            url: url,
            method: "delete",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                }
            }
        });
    instr.onSuccess = new ResponseMessage(`Added ${labelName} label`)
    CommonHandlers.handleErrors(instr, { msg: "The remove-label request to GitHub failed" });
    return instr;

}

function closeIssue(owner: string, repo: string, issue: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}`;

    let instr = PlanUtils.execute("http",
        {
            url: url,
            method: "patch",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                },
                body: JSON.stringify({
                    state: "closed"
                })
            }
        });
    instr.onSuccess = new ResponseMessage(`#${issue} Closed.`)
    CommonHandlers.handleErrors(instr, { msg: "The close request to GitHub failed" });
    return instr;

}

function success(pet: GitHubId | Sadness): pet is GitHubId {
    return (<GitHubId>pet).login !== undefined;
}

interface Sadness {
    error: string
}

function githubLoginFromSlackUser(context: HandlerContext, slackUser: string): GitHubId | Sadness {
    if (1 > 0) {
        //TODO: take this out when bug is fixed and the below works
        return new GitHubId().withLogin("jessitron");

    } else {
        let userMatch = context.pathExpressionEngine.evaluate<ChatTeam, GitHubId>(context.contextRoot as ChatTeam,
            `/members::ChatId()[@id='${slackUser}']/person::Person()/gitHubId::GitHubId()`);

        if (userMatch == null) {
            return { error: "null result" }
        }
        let matches = userMatch.matches;
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
}

export const beComplete = new BeComplete();
