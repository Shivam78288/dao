pragma solidity 0.8.10;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovToken is ERC20{
    constructor() public ERC20("GovToken","GTK"){}
    function faucet(address recepient, uint amount) external{
        _mint(recepient,amount);
    }
}