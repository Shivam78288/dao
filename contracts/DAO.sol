pragma solidity 0.8.10;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DAO{
    IERC20 public govToken;
    address public owner;
    constructor(address _govToken) public{
        govToken = IERC20(_govToken);
        owner = msg.sender;
    }

    enum SIDE{SUPPORT, REJECT}
    enum STATUS{UNDECIDED, APPROVED, REJECTED}
    struct Proposal{
        bytes32 hash;
        address author;
        uint votesSUPPORT;
        uint votesREJECT;
        uint createdAt;
        STATUS status;
    }
    //Min shares one must possess to create a proposal
    uint public minSharesToCreateProposal = 100 * 10 ** 18;
    //Time period in which a proposal must be voted on
    uint public votingPeriod = 7 days;
    //Checking if an address has voted on a proposal
    mapping(address => mapping(bytes32 => bool)) public votes;
    //To know if a user has voted yes or no on a specific proposal.
    mapping(address => mapping(bytes32 => uint)) public sideOfVote; 
    //Mapping to get proposals by hash
    mapping(bytes32 => Proposal) public proposals;
    //Mapping to find how many shares an address has
    mapping(address => uint) public shares;
    uint public totalShares;
    
    //Function to deposit their shares to the contract in order to vote
    function deposit(uint amount) external{
        _deposit(msg.sender, amount);
    }
    function _deposit(address depositer,uint amount) private{
        govToken.transferFrom(depositer, address(this), amount);
        shares[depositer] += amount;
        totalShares += amount;
    }

    //Funtion for users to withdraw their shares
    function withdraw(uint amount) external{
        require(shares[msg.sender] >= amount, "Shares too low");
        _withdraw(msg.sender, amount);
    }

    function _withdraw(address recepient, uint amount) private{
        shares[recepient] -= amount;
        totalShares -= amount;
        bool sent = govToken.transfer(recepient, amount);  
        require(sent, "Transfer Failed");
    }

    //Function to create proposal
    function createProposal(bytes32 proposalHash) external{
        //Checking if address is eligible to create proposals
        require(
            shares[msg.sender] >= minSharesToCreateProposal, 
            "Shares too low to create proposal"
            );
        //Checking if proposal already exist
        require(
            proposals[proposalHash].hash == bytes32(0), 
            "Proposal already exist"
            );
        //Creating proposal
        proposals[proposalHash] = Proposal(
                                        proposalHash, 
                                        msg.sender, 
                                        0,
                                        0,
                                        block.timestamp, 
                                        STATUS.UNDECIDED);
    }

    //Function for voting
    function vote(SIDE side, bytes32 proposalHash) external{
        Proposal storage proposal = proposals[proposalHash];
        require(
            proposal.hash != bytes32(0), 
            "Proposal doesn't exist"
            );
        require(
            block.timestamp < proposal.createdAt + votingPeriod, 
            "Voting period over"
            );
        require(
            votes[msg.sender][proposalHash] == false, 
            "Already voted"
            );
        _vote(msg.sender, side, proposalHash);
    }

    function _vote(address voter, SIDE side, bytes32 proposalHash) private{
        Proposal storage proposal = proposals[proposalHash];
        votes[voter][proposalHash] = true;
        if(side == SIDE.SUPPORT){
            proposal.votesSUPPORT += shares[voter];
            sideOfVote[voter][proposalHash] = 0;
            if((proposal.votesSUPPORT * 100/ totalShares) > 50){
                proposal.status = STATUS.APPROVED;
            }
        }
        if(side == SIDE.REJECT){
            proposal.votesREJECT += shares[voter];
            sideOfVote[voter][proposalHash] = 1;
            if((proposal.votesREJECT * 100/ totalShares) > 50){
                proposal.status = STATUS.REJECTED;
            }
        }

    }

    //Function to change vote
    function changeVote(bytes32 proposalHash) external{
        Proposal storage proposal = proposals[proposalHash];
        require(
            proposal.hash != bytes32(0),
            "Proposal doesn't exist"
        );
        require(
            votes[msg.sender][proposalHash] == true,
            "You haven't even voted till now"
        );
        require(
            block.timestamp < proposal.createdAt + votingPeriod,
            "Voting period over"
        );
        _changeVote(msg.sender, proposalHash);
    }

    function _changeVote(address voter, bytes32 proposalHash) private{
        Proposal storage proposal = proposals[proposalHash];
        //If side is support
        if(sideOfVote[voter][proposalHash] == uint(SIDE.SUPPORT)){
            sideOfVote[voter][proposalHash] = uint(SIDE.REJECT);
            proposal.votesREJECT += shares[voter];
            proposal.votesSUPPORT -= shares[voter];
            if((proposal.votesREJECT * 100/ totalShares) > 50){
                proposal.status = STATUS.REJECTED;
            }
        }
        //If side is reject
        else{
            sideOfVote[voter][proposalHash] = uint(SIDE.SUPPORT);
            proposal.votesREJECT -= shares[voter];
            proposal.votesSUPPORT += shares[voter];
            if((proposal.votesSUPPORT * 100/ totalShares) > 50){
                proposal.status = STATUS.APPROVED;
            }
        }
    }

    //Function to see time remaining for proposal to be voted on
    function timeLeft(bytes32 proposalHash) external view returns(uint){
        Proposal storage proposal = proposals[proposalHash];
        require(
            block.timestamp < proposal.createdAt + votingPeriod,
            "Time already over for voting on this proposal"
            );
        return (proposal.createdAt + votingPeriod - block.timestamp);
    }

    //function to change min no of shares to vote
    function changeMinSharesToCreateProposal(
        uint newMinShares) 
        external 
        onlyOwner{
            uint oldMinShares = minSharesToCreateProposal;
            minSharesToCreateProposal = newMinShares *10 ** 18;
            emit MinShareToCreateProposalChanged(oldMinShares/(10**18), newMinShares);
    }

    //Function to change voting period
    function changeVotingPeriod(uint newVotingPeriod) external onlyOwner{
        uint oldVotingPeriod = votingPeriod;
        votingPeriod = newVotingPeriod;
        emit VotingPeriodChanged(oldVotingPeriod, newVotingPeriod);
    }
    
    
    //function to change owner
    function changeOwner(address newOwner) external onlyOwner{
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerChanged(oldOwner, newOwner);
    }

    modifier onlyOwner{
        require(
            msg.sender == owner,
            "Only Owner"
        );
        _;
    }

    event OwnerChanged(address oldOwner, address newOwner);
    event VotingPeriodChanged(uint oldVotingPeriod, uint newVotingPeriod);
    event MinShareToCreateProposalChanged(uint oldMinShares, uint newMinShares);

}