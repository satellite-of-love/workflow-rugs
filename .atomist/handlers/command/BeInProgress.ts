import { HandleCommand, HandlerContext, MappedParameters, ResponseMessage, CommandPlan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, Parameter, MappedParameter, Tags, Intent, Secrets } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import { ChatTeam } from '@atomist/cortex/ChatTeam';
import { GitHubId } from '@atomist/cortex/stub/GitHubId';
import { Person } from '@atomist/cortex/stub/Person';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';
import { githubLoginFromSlackUser, Sadness } from './shared/GitHubFromSlack'

/**
 * A mark an issue as in-progress.
 */
@CommandHandler("BeInProgress", "mark an issue as in-progress")
@Tags("issue", "satellite-of-love", "workflow")
@Intent("start work")
@Secrets("github://user_token?scopes=repo")
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
        plan.add(addAssigneeToIssue(this.owner, this.repo, this.issue, login))
        // TODO: remove this label from all other issues assigned to me

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

function addAssigneeToIssue(owner: string, repo: string, issue: string, login: string) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issue}/assignees`;

    let instr = PlanUtils.execute("http",
        {
            url: url,
            method: "post",
            config: {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `token #{github://user_token?scopes=repo}`,
                },
                body: JSON.stringify({
                    "assignees": [
                        login
                    ]
                })
            }
        });
    instr.onSuccess = new ResponseMessage(`Assigned ${login}`)
    CommonHandlers.handleErrors(instr, { msg: "The assign request to GitHub failed" });
    return instr;

}

function success(pet: GitHubId | Sadness): pet is GitHubId {
    return (<GitHubId>pet).login !== undefined;
}

export const beInProgress = new BeInProgress();
