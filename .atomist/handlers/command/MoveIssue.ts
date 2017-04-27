import { HandleCommand, HandlerContext, MappedParameters, Response, HandleResponse, ResponseMessage, CommandPlan } from '@atomist/rug/operations/Handlers';
import { CommandHandler, ResponseHandler, Parameter, MappedParameter, Tags, Secrets, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';
import * as PlanUtils from '@atomist/rugs/operations/PlanUtils';

/**
 * A move an issue from one repo to another.
 */
@CommandHandler("MoveIssue", "move an issue from one repo to another")
@Tags("issue", "satellite-of-love", "workflow")
@Secrets("github://user_token?scopes=repo")
@Intent("move issue")
export class MoveIssue implements HandleCommand {

    @MappedParameter(MappedParameters.GITHUB_REPOSITORY)
    fromRepo: string;

    @MappedParameter(MappedParameters.GITHUB_REPO_OWNER)
    fromOrg: string;

    @Parameter({
        displayName: "To org/repo",
        description: "destination for the issue. org/repo",
        pattern: Pattern.any,
        validInput: "org/repo"
    })
    toOrgRepo: string;


    @Parameter({
        displayName: "Issue number",
        description: "issue number",
        pattern: Pattern.any
    })
    issue: string;

    handle(command: HandlerContext): CommandPlan {
        let plan = new CommandPlan();
        let to = parseOrgRepo(this.toOrgRepo, this.fromOrg)

        let message = new ResponseMessage(`Moving issue: ${this.fromOrg}/${this.fromRepo}#${this.issue} to ${this.toOrgRepo}`);
        plan.add(message);

        const url = `https://api.github.com/repos/${this.fromOrg}/${this.fromRepo}/issues/${this.issue}`;

        let retrieveIssueInstruction = PlanUtils.execute("http",
            {
                url: url,
                method: "get",
                config: {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `token #{github://user_token?scopes=repo}`,
                    },
                }
            });
        retrieveIssueInstruction.onSuccess = { kind: "respond", name: "ReceiveIssueToMove", parameters: { toOrg: to.org, toRepo: to.repo } }

        CommonHandlers.handleErrors(retrieveIssueInstruction, { msg: "The request to GitHub failed" });
        plan.add(retrieveIssueInstruction);


        return plan;
    }
}

interface OrgAndRepo { repo: string, org: string }

function parseOrgRepo(orgRepo: string, defaultOrg: string): OrgAndRepo {
    let org = defaultOrg;
    let parts = orgRepo.split("/")
    let repo = parts[0];
    if (parts.length > 1) {
        org = parts[0];
        repo = parts[1];
    }

    return { repo: repo, org: org }
}


@ResponseHandler("ReceiveIssueToMove", "step 2 in MoveIssue")
@Secrets("github://user_token?scopes=repo")
class ReceiveIssueToMove implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    toOrg: string;

    @Parameter({ pattern: Pattern.any })
    toRepo: string;

    handle(response: Response<any>): CommandPlan {
        let plan = new CommandPlan();
        let issueToMove = JSON.parse(response.body);

        if (issueToMove.state === "closed") {
            plan.add(new ResponseMessage(`<${issueToMove.html_url}|That issue> is already closed.`))
            return plan;
        }
        // should I refuse to move PRs?

        plan.add(new ResponseMessage(`Creating issue in ${this.toOrg}/${this.toRepo}`))

        let title = issueToMove.title;
        let body = `${issueToMove.body}
        
Moved from ${issueToMove.html_url}`;
        let assignees = issueToMove.assignees.map(f => f.login);
        let labels = issueToMove.labels.map(l => l.name);


        const url = `https://api.github.com/repos/${this.toOrg}/${this.toRepo}/issues`;

        let createIssueInstruction = PlanUtils.execute("http",
            {
                url: url,
                method: "post",
                config: {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `token #{github://user_token?scopes=repo}`,
                    },

                    body: JSON.stringify({
                        title: title,
                        body: body,
                        assignees: assignees,
                        labels: labels
                    })
                }
            });
        createIssueInstruction.onSuccess = { kind: "respond", name: "ReceiveMovedIssue", parameters: { fromUrl: issueToMove.url } }

        CommonHandlers.handleErrors(createIssueInstruction, { msg: "The new-issue post to GitHub failed" });
        plan.add(createIssueInstruction);

        return plan;
    }
}

@ResponseHandler("ReceiveMovedIssue", "step 3 in MoveIssue")
@Secrets("github://user_token?scopes=repo")
class ReceiveMovedIssue implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    fromUrl: string;

    handle(response: Response<any>): CommandPlan {
        let plan = new CommandPlan();
        let newIssue = JSON.parse(response.body);
        plan.add(new ResponseMessage(`Commenting on original issue`))

        {
            let comment = `Moved to ${newIssue.html_url}`;

            const url = `${this.fromUrl}/comments`;

            let commentInstruction = PlanUtils.execute("http",
                {
                    url: url,
                    method: "post",
                    config: {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `token #{github://user_token?scopes=repo}`,
                        },

                        body: JSON.stringify({
                            body: comment
                        })
                    }
                });
            commentInstruction.onSuccess = { kind: "respond", name: "ReceiveCommentedOnOriginalIssue", parameters: { fromUrl: this.fromUrl, toHtmlUrl: newIssue.html_url } }
            CommonHandlers.handleErrors(commentInstruction, { msg: "The comment post to GitHub failed" });
            plan.add(commentInstruction);
        }

        { // remove any status labels from the issue
            const url = `${this.fromUrl}/labels/in-progress`;

            let commentInstruction = PlanUtils.execute("http",
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
            commentInstruction.onSuccess = { kind: "respond", name: "ReceiveCommentedOnOriginalIssue", parameters: { fromUrl: this.fromUrl, toHtmlUrl: newIssue.html_url } }
            CommonHandlers.handleErrors(commentInstruction, { msg: "The comment post to GitHub failed" });
            plan.add(commentInstruction);
        }

        return plan;
    }
}


@ResponseHandler("ReceiveCommentedOnOriginalIssue", "step 4 in MoveIssue")
@Secrets("github://user_token?scopes=repo")
class ReceiveCommentedOnOriginalIssue implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    fromUrl: string;

    @Parameter({ pattern: Pattern.any })
    toHtmlUrl: string;

    handle(response: Response<any>): CommandPlan {
        let plan = new CommandPlan();
        let newIssue = JSON.parse(response.body);
        plan.add(new ResponseMessage(`Closing original issue`))

        const url = this.fromUrl;

        let closeIssueInstruction = PlanUtils.execute("http",
            {
                url: url,
                method: "post",
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
        closeIssueInstruction.onSuccess = new ResponseMessage(`Done! <${this.toHtmlUrl}|New issue created>`)

        CommonHandlers.handleErrors(closeIssueInstruction, { msg: "The close-issue patch to GitHub failed" });
        plan.add(closeIssueInstruction);

        return plan;
    }
}

export const genericErrorHandler = new CommonHandlers.GenericErrorHandler();
export const receiveCommented = new ReceiveCommentedOnOriginalIssue();
export const receiveIssueToMove = new ReceiveIssueToMove();
export const receiveMovedIssue = new ReceiveMovedIssue();
export const moveIssue = new MoveIssue();
