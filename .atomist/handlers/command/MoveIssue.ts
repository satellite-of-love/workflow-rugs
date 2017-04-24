import { HandleCommand, HandlerContext, MappedParameters, Response, HandleResponse, ResponseMessage, Plan , Respondable} from '@atomist/rug/operations/Handlers';
import { CommandHandler, ResponseHandler, Parameter, MappedParameter, Tags, Intent } from '@atomist/rug/operations/Decorators';
import { Pattern } from '@atomist/rug/operations/RugOperation';
import * as CommonHandlers from '@atomist/rugs/operations/CommonHandlers';

/**
 * A move an issue from one repo to another.
 */
@CommandHandler("MoveIssue", "move an issue from one repo to another")
@Tags("issue", "satellite-of-love", "workflow")
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

    handle(command: HandlerContext): Plan {
        let plan = new Plan();
        let message = new ResponseMessage(`Moving issue: ${this.fromOrg}/${this.fromRepo}#${this.issue} to ${this.toOrgRepo}`);
        plan.add(message);

        const url = `https://api.github.com/repos/${this.fromOrg}/${this.fromRepo}/issues/${this.issue}`;
        
        let retrieveIssueInstruction: Respondable<any> = {
            instruction: {
                kind: "execute",
                name: "http",
                parameters: {
                    url: url,
                    method: "get",
                    config: {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `token #{github://user_token?scopes=repo}`,
                        },
                    }
                }
            }
            ,
            onSuccess: { kind: "respond", name: "ReceiveIssueToMove", parameters: { } }
        };
        CommonHandlers.handleErrors(retrieveIssueInstruction, { msg: "The request to GitHub failed" });
        plan.add(retrieveIssueInstruction);
      

        return plan;
    }
}


@ResponseHandler("ReceiveIssueToMove", "step 2 in MoveIssue")
class ReceiveIssueToMove implements HandleResponse<any> {
    @Parameter({ pattern: Pattern.any })
    queryString: string;

    handle(response: Response<any> ): Plan {
        let plan = new Plan();
        let result = JSON.parse(response.body)

        return plan;
    }}

export const receiveIssueToMove = new ReceiveIssueToMove();
export const moveIssue = new MoveIssue();
